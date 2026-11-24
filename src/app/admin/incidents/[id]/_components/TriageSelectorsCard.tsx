'use client';

import { useState } from 'react';
import type { CategoryItem, IncidentDetail } from './types';

interface TriageSelectorsCardProps {
  incident: IncidentDetail;
  categories: CategoryItem[];
  rootCauses: string[];
  isClosed: boolean;
  isManager: boolean;
  onIncidentUpdated: (updated: IncidentDetail) => void;
  onRootCausesUpdated: (next: string[]) => void;
  onClearFeedback: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function TriageSelectorsCard({
  incident,
  categories,
  rootCauses,
  isClosed,
  isManager,
  onIncidentUpdated,
  onRootCausesUpdated,
  onClearFeedback,
  showToast,
}: TriageSelectorsCardProps) {
  const isReadOnly = isClosed || isManager;
  const [newRootCause, setNewRootCause] = useState('');
  const [addingRootCause, setAddingRootCause] = useState(false);

  const [prevTicketNo, setPrevTicketNo] = useState(incident.ticketNo);
  if (prevTicketNo !== incident.ticketNo) {
    setPrevTicketNo(incident.ticketNo);
    setNewRootCause('');
  }

  const handleSelectCategory = async (catName: string) => {
    if (!incident) return;
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: catName }),
      });
      if (res.ok) {
        const updated = await res.json();
        onIncidentUpdated(updated);
        onClearFeedback();
        showToast(`Category updated to ${catName}`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถเปลี่ยน Category ได้', 'error');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectRootCause = async (rcName: string) => {
    if (!incident) return;
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootCause: rcName }),
      });
      if (res.ok) {
        const updated = await res.json();
        onIncidentUpdated(updated);
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

  const handleAddRootCause = async () => {
    const clean = newRootCause.trim();
    if (!clean) return;
    setAddingRootCause(true);
    try {
      const res = await fetch('/api/root-causes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data)) {
        onRootCausesUpdated(data);
        setNewRootCause('');
        await handleSelectRootCause(clean);
      } else {
        showToast(data.error || 'ไม่สามารถเพิ่ม Root Cause ได้', 'error');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAddingRootCause(false);
    }
  };

  return (
    <>
      {/* Dynamic Category & Triage Routing Selector */}
      <div
        className={`bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.05)] border space-y-3.5 ${
          !incident.category?.trim() ? 'border-amber-300' : 'border-sky-100'
        }`}
      >
        <div className="flex items-center justify-between">
          <label className="text-xs font-headline font-bold text-slate-900 flex items-center gap-2">
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
            const isSelected = incident.category === cat.name;
            return (
              <button
                key={cat.id}
                type="button"
                disabled={isReadOnly}
                onClick={() => handleSelectCategory(cat.name)}
                className={`py-2 px-2.5 rounded-xl flex items-center gap-2 transition-all text-xs font-semibold cursor-pointer disabled:cursor-not-allowed ${
                  isSelected
                    ? 'bg-sky-600 text-white shadow-[0_4px_12px_rgba(2,132,199,0.3)] border border-sky-600'
                    : 'bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-200 text-slate-700 disabled:opacity-50'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
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
            Queue: <strong className="text-slate-900">{incident.category || 'ยังไม่ได้เลือก'}</strong>
          </span>
        </div>
      </div>

      {/* Root Cause Analysis (RCA Category) Selector */}
      <div
        className={`bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.05)] border space-y-3.5 ${
          !incident.rootCause?.trim() ? 'border-amber-300' : 'border-sky-100'
        }`}
      >
        <div className="flex items-center justify-between">
          <label className="text-xs font-headline font-bold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-indigo-600">troubleshoot</span>
            Root Cause Analysis
          </label>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              incident.rootCause?.trim()
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            {incident.rootCause?.trim() ? 'Selected' : '* จำเป็นก่อนปิดเคส'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {rootCauses.map((rc) => {
            const isSelected = incident.rootCause === rc;
            return (
              <button
                key={rc}
                type="button"
                disabled={isReadOnly}
                onClick={() => handleSelectRootCause(rc)}
                className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:cursor-not-allowed border ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/25'
                    : 'bg-slate-50 hover:bg-indigo-50 text-slate-700 border-slate-200 hover:border-indigo-200 disabled:opacity-50'
                }`}
              >
                {rc}
              </button>
            );
          })}
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newRootCause}
              onChange={(e) => setNewRootCause(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddRootCause();
                }
              }}
              placeholder="เพิ่ม Root Cause ใหม่ (เช่น Vendor, Network)..."
              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-400"
            />
            <button
              type="button"
              disabled={addingRootCause || !newRootCause.trim()}
              onClick={handleAddRootCause}
              className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold cursor-pointer disabled:opacity-50 shrink-0"
            >
              + เพิ่ม
            </button>
          </div>
        )}
      </div>
    </>
  );
}
