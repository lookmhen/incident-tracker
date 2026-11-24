'use client';

import { useState } from 'react';
import ManageRootCausesModal, { type RootCauseNode } from '@/components/ManageRootCausesModal';
import type { CategoryItem, IncidentDetail } from './types';

interface TriageSelectorsCardProps {
  incident: IncidentDetail;
  categories: CategoryItem[];
  rootCauseTree: RootCauseNode[];
  isClosed: boolean;
  isManager: boolean;
  onIncidentUpdated: (updated: IncidentDetail) => void;
  onRootCauseTreeUpdated: (next: RootCauseNode[]) => void;
  onDataMutated?: () => void;
  onClearFeedback: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function TriageSelectorsCard({
  incident,
  categories,
  rootCauseTree,
  isClosed,
  isManager,
  onIncidentUpdated,
  onRootCauseTreeUpdated,
  onDataMutated,
  onClearFeedback,
  showToast,
}: TriageSelectorsCardProps) {
  const isReadOnly = isClosed || isManager;
  const [hoveredParent, setHoveredParent] = useState<string | null>(null);
  const [pinnedParent, setPinnedParent] = useState<string | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);

  const [prevTicketNo, setPrevTicketNo] = useState(incident.ticketNo);
  if (prevTicketNo !== incident.ticketNo) {
    setPrevTicketNo(incident.ticketNo);
    setHoveredParent(null);
    setPinnedParent(null);
    setShowManageModal(false);
  }

  const rawRootCause = incident.rootCause?.trim() || '';
  const sepIdx = rawRootCause.indexOf(' > ');
  const selectedParent = sepIdx >= 0 ? rawRootCause.slice(0, sepIdx) : rawRootCause;
  const selectedChild = sepIdx >= 0 ? rawRootCause.slice(sepIdx + 3) : '';
  const hasSubBranch = sepIdx >= 0 && Boolean(selectedChild);
  const isBareParent = Boolean(rawRootCause) && !hasSubBranch;

  const validPinnedParent =
    pinnedParent && rootCauseTree.some((n) => n.name === pinnedParent) ? pinnedParent : null;
  const expandedParentName = validPinnedParent ?? hoveredParent ?? (selectedParent || null);
  const expandedNode = expandedParentName
    ? rootCauseTree.find((n) => n.name === expandedParentName) ?? null
    : null;

  const handleSelectCategory = async (cat: CategoryItem) => {
    if (!incident || isReadOnly) return;
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat.name, categoryId: cat.id }),
      });
      if (res.ok) {
        const updated = await res.json();
        onIncidentUpdated(updated);
        onClearFeedback();
        showToast(`Category updated to ${cat.name}`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถเปลี่ยน Category ได้', 'error');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectRootCause = async (rcName: string) => {
    if (!incident || isReadOnly) return;
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootCause: rcName }),
      });
      if (res.ok) {
        const updated = await res.json();
        onIncidentUpdated(updated);
        setPinnedParent(rcName.split(' > ')[0] || null);
        onClearFeedback();
        showToast(`Root Cause updated to ${rcName}`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถเปลี่ยน Root Cause ได้', 'error');
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      {/* Dynamic Category & Triage Routing Selector */}
      <div
        className={`bg-white rounded-2xl p-6 shadow-2xs border space-y-3.5 ${
          !incident.category?.trim() ? 'border-amber-300' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <label className="text-xs font-headline font-semibold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-sky-600">alt_route</span>
            Category &amp; Routing
          </label>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              incident.category?.trim()
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            {incident.category?.trim() ? 'Selected' : '* จำเป็นก่อนปิดเคส'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {categories.map((cat) => {
            const isSelected = incident.categoryId
              ? incident.categoryId === cat.id
              : incident.category === cat.name;
            const catColor = cat.color || '#0284c7';
            return (
              <button
                key={cat.id}
                type="button"
                disabled={isReadOnly}
                onClick={() => handleSelectCategory(cat)}
                style={
                  isSelected
                    ? {
                        backgroundColor: `${catColor}20`,
                        borderColor: catColor,
                        boxShadow: `0 4px 12px ${catColor}30`,
                      }
                    : undefined
                }
                className={`py-2 px-2.5 rounded-xl flex items-center gap-2 transition-colors text-xs font-semibold cursor-pointer disabled:cursor-not-allowed border ${
                  isSelected
                    ? 'text-slate-900'
                    : 'bg-slate-50 hover:bg-sky-50 border-slate-200 hover:border-sky-200 text-slate-700 disabled:opacity-50'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: catColor }} />
                <span className="material-symbols-outlined text-[18px]" style={{ color: catColor }}>
                  {cat.slug.includes('sap')
                    ? 'database'
                    : cat.slug.includes('net')
                    ? 'lan'
                    : cat.slug.includes('interface')
                    ? 'hub'
                    : 'support_agent'}
                </span>
                <span className="truncate">{cat.name}</span>
              </button>
            );
          })}
        </div>

        <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200/80 text-[11px] text-slate-600 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-sky-600">verified_user</span>
            Queue: <strong className="text-slate-900">{incident.categoryRel?.name || incident.category || 'ยังไม่ได้เลือก'}</strong>
          </span>
        </div>
      </div>

      {/* Hierarchical Root Cause Analysis Selector (Parent > Sub-branch) */}
      <div
        className={`bg-white rounded-2xl p-6 shadow-2xs border space-y-3.5 ${
          !hasSubBranch ? 'border-amber-300' : 'border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-headline font-semibold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-indigo-600">troubleshoot</span>
            Root Cause Analysis
          </label>
          <div className="flex items-center gap-1.5">
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setShowManageModal(true)}
                className="px-2 py-0.5 rounded-lg bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                title="จัดการ Root Cause และ Branch ย่อย"
              >
                <span className="material-symbols-outlined text-[13px]">tune</span>
                <span>Manage</span>
              </button>
            )}
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                hasSubBranch
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {hasSubBranch
                ? 'Selected'
                : isBareParent
                ? '* กรุณาเลือก Branch ย่อย'
                : '* จำเป็นก่อนปิดเคส'}
            </span>
          </div>
        </div>

        {/* Parent Buttons + Sub-branch Tray */}
        <div
          onMouseLeave={() => {
            if (!isReadOnly) setHoveredParent(null);
          }}
          className="space-y-2.5"
        >
          <div className="flex flex-wrap gap-2">
            {rootCauseTree.map((node) => {
              const isSelectedParent = selectedParent === node.name;
              const isExpanded = expandedParentName === node.name;
              return (
                <button
                  key={node.name}
                  type="button"
                  disabled={isReadOnly}
                  onMouseEnter={() => {
                    if (!isReadOnly) setHoveredParent(node.name);
                  }}
                  onClick={() => {
                    if (isReadOnly) return;
                    setPinnedParent((prev) => (prev === node.name ? null : node.name));
                  }}
                  aria-expanded={isExpanded}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed border flex items-center gap-1.5 ${
                    isSelectedParent
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : isExpanded
                      ? 'bg-indigo-50 text-indigo-800 border-indigo-300 ring-1 ring-indigo-200'
                      : 'bg-slate-50 hover:bg-indigo-50 text-slate-700 border-slate-200 hover:border-indigo-200 disabled:opacity-50'
                  }`}
                >
                  <span>{node.name}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      isSelectedParent
                        ? 'bg-white/20 text-white'
                        : 'bg-white text-slate-500 border border-slate-200/80'
                    }`}
                  >
                    {node.children.length}
                  </span>
                </button>
              );
            })}
          </div>

          {expandedNode ? (
            <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-indigo-900 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-indigo-600">
                    subdirectory_arrow_right
                  </span>
                  <span>Branch ย่อยของ {expandedNode.name}</span>
                </span>
                {!isReadOnly && (
                  <span className="text-[10px] text-indigo-600/80">คลิกเพื่อเลือก Branch</span>
                )}
              </div>

              {expandedNode.children.length === 0 ? (
                <div className="text-[11px] text-slate-500 flex items-center justify-between gap-2 py-0.5">
                  <span>ยังไม่มี Branch ย่อยในกลุ่มนี้</span>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => setShowManageModal(true)}
                      className="text-indigo-700 hover:underline font-semibold cursor-pointer"
                    >
                      + เพิ่มใน Manage
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {expandedNode.children.map((child) => {
                    const fullPath = `${expandedNode.name} > ${child}`;
                    const isSelectedChild = rawRootCause === fullPath;
                    return (
                      <button
                        key={fullPath}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handleSelectRootCause(fullPath)}
                        className={`py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed border ${
                          isSelectedChild
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs font-semibold'
                            : 'bg-white hover:bg-indigo-100 text-slate-700 border-indigo-200 disabled:opacity-60'
                        }`}
                      >
                        {child}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            !isReadOnly && (
              <div className="px-3 py-2 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-[11px] text-slate-500">
                ชี้หรือคลิกกลุ่มหลักด้านบนเพื่อเลือก Branch ย่อย
              </div>
            )
          )}
        </div>

        {/* Selected Breadcrumb Badge */}
        {hasSubBranch ? (
          <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/80 text-[11px] text-slate-700 flex items-center gap-1.5 flex-wrap">
            <span className="material-symbols-outlined text-[14px] text-indigo-600">account_tree</span>
            <span className="text-slate-500">Selected:</span>
            <span className="inline-flex items-center gap-1 font-semibold text-indigo-900 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
              <span>{selectedParent}</span>
              <span className="text-indigo-400">›</span>
              <span>{selectedChild}</span>
            </span>
          </div>
        ) : isBareParent ? (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px] text-amber-600">warning</span>
              <span>
                Selected: <strong>{selectedParent}</strong>
              </span>
            </span>
            <span className="font-semibold">* กรุณาเลือก Branch ย่อย</span>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-500 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-slate-400">account_tree</span>
            <span>
              Selected: <strong className="text-slate-700">ยังไม่ได้เลือก</strong>
            </span>
          </div>
        )}
      </div>

      {!isReadOnly && (
        <ManageRootCausesModal
          isOpen={showManageModal}
          onClose={() => setShowManageModal(false)}
          tree={rootCauseTree}
          onTreeUpdated={(next) => {
            setPinnedParent(null);
            onRootCauseTreeUpdated(next);
          }}
          onDataMutated={onDataMutated}
        />
      )}
    </>
  );
}
