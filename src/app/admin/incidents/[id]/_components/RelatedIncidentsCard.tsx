'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { IncidentDetail, RelatedIncidentSummary, RelatedSearchResult } from './types';
import { statusPillClass } from './utils';

interface RelatedIncidentsCardProps {
  incident: IncidentDetail;
  isClosed: boolean;
  isManager: boolean;
  onIncidentUpdated: (updated: IncidentDetail) => void;
  onCopyResolution: (source: RelatedIncidentSummary) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function RelatedIncidentsCard({
  incident,
  isClosed,
  isManager,
  onIncidentUpdated,
  onCopyResolution,
  showToast,
}: RelatedIncidentsCardProps) {
  const [relatedQuery, setRelatedQuery] = useState('');
  const [relatedSearchResults, setRelatedSearchResults] = useState<RelatedSearchResult[]>([]);
  const [searchingRelated, setSearchingRelated] = useState(false);
  const [savingRelated, setSavingRelated] = useState(false);

  const [prevTicketNo, setPrevTicketNo] = useState(incident.ticketNo);
  if (prevTicketNo !== incident.ticketNo) {
    setPrevTicketNo(incident.ticketNo);
    setRelatedQuery('');
    setRelatedSearchResults([]);
  }

  useEffect(() => {
    const q = relatedQuery.trim();
    if (q.length < 2) {
      setRelatedSearchResults([]);
      setSearchingRelated(false);
      return;
    }
    const controller = new AbortController();
    setSearchingRelated(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/incidents?search=${encodeURIComponent(q)}&limit=10`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (res.ok) {
          const data = await res.json();
          if (!controller.signal.aborted) {
            setRelatedSearchResults(Array.isArray(data?.incidents) ? data.incidents : []);
          }
        } else {
          setRelatedSearchResults([]);
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error(e);
          setRelatedSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearchingRelated(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [relatedQuery]);

  const handleUpdateRelatedTickets = async (nextNos: string[], toastMsg?: string) => {
    if (!incident || savingRelated) return false;
    setSavingRelated(true);
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relatedTickets: nextNos }),
      });
      if (res.ok) {
        const updated = await res.json();
        onIncidentUpdated(updated);
        if (toastMsg) showToast(toastMsg);
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถอัปเดตเคสอ้างอิงได้', 'error');
        return false;
      }
    } catch (e) {
      console.error(e);
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
      return false;
    } finally {
      setSavingRelated(false);
    }
  };

  const relatedIncidents = incident.relatedIncidents || [];
  const referencedBy = incident.referencedBy || [];
  const currentRelatedNos = relatedIncidents.map((r) => r.ticketNo);
  const canEditRelated = !isClosed && !isManager;
  const filteredRelatedResults = relatedSearchResults.filter(
    (item) => item.ticketNo !== incident.ticketNo && !currentRelatedNos.includes(item.ticketNo)
  );

  return (
    <div className="bg-white rounded-2xl p-6 shadow-2xs border border-slate-200 space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shrink-0">
            <span className="material-symbols-outlined text-[18px]">link</span>
          </span>
          <div className="min-w-0">
            <h3 className="text-xs font-headline font-semibold text-slate-900">
              Related Incidents (อ้างอิงเคสเก่า)
            </h3>
            <p className="text-[11px] text-slate-500">เชื่อมโยงเคสที่เคยเกิดขึ้นเพื่ออ้างอิงวิธีแก้ไข</p>
          </div>
        </div>
        <span className="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-semibold font-mono shrink-0">
          {relatedIncidents.length} linked
        </span>
      </div>

      {canEditRelated && (
        <div className="relative">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined text-[16px] text-slate-400 absolute left-3 pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={relatedQuery}
              disabled={savingRelated}
              onChange={(e) => setRelatedQuery(e.target.value)}
              placeholder="ค้นหาเลขเคส (INC-*), หัวข้อ หรือรายละเอียดปัญหา..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 disabled:opacity-60"
            />
            {relatedQuery && (
              <button
                type="button"
                onClick={() => {
                  setRelatedQuery('');
                  setRelatedSearchResults([]);
                }}
                aria-label="Clear search"
                className="absolute right-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {relatedQuery.trim().length >= 2 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
              {searchingRelated ? (
                <div className="px-3 py-2.5 text-xs text-slate-500 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[15px] animate-spin text-sky-600">sync</span>
                  <span>กำลังค้นหาเคส...</span>
                </div>
              ) : filteredRelatedResults.length === 0 ? (
                <div className="px-3 py-2.5 text-xs text-slate-500">ไม่พบเคสที่ตรงกัน</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredRelatedResults.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-sky-50/80 transition-colors"
                    >
                      <button
                        type="button"
                        disabled={savingRelated}
                        onClick={async () => {
                          const ok = await handleUpdateRelatedTickets(
                            [...currentRelatedNos, item.ticketNo],
                            `เชื่อมโยงเคส ${item.ticketNo} แล้ว`
                          );
                          if (ok) {
                            setRelatedQuery('');
                            setRelatedSearchResults([]);
                          }
                        }}
                        className="flex-1 min-w-0 text-left flex items-start justify-between gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-mono font-bold text-sky-700 shrink-0">
                              {item.ticketNo}
                            </span>
                            <span className="text-xs text-slate-800 truncate">{item.title}</span>
                          </div>
                          {item.description && (
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">{item.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          {item.resolutionType === 'WORKAROUND' && (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                              Workaround
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded-md border text-[10px] font-mono font-semibold ${statusPillClass(item.status)}`}
                          >
                            {item.status}
                          </span>
                        </div>
                      </button>
                      <a
                        href={`/admin/incidents/${item.ticketNo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`เปิดดู ${item.ticketNo} ในแท็บใหม่`}
                        aria-label={`Open ${item.ticketNo} in new tab`}
                        className="shrink-0 px-2 py-1 rounded-lg bg-white hover:bg-sky-600 text-sky-700 hover:text-white border border-sky-200 text-[10px] font-semibold inline-flex items-center gap-1 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                        <span>Open</span>
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {relatedIncidents.length > 0 ? (
        <div className="space-y-2">
          {relatedIncidents.map((rel) => (
            <div
              key={rel.ticketNo}
              className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/80 hover:border-sky-200 transition-colors space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/admin/incidents/${rel.ticketNo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`เปิดดู ${rel.ticketNo} ในแท็บใหม่`}
                  className="min-w-0 flex-1 group"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-mono font-bold text-sky-700 group-hover:underline inline-flex items-center gap-1">
                      <span>{rel.ticketNo}</span>
                      <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md border text-[10px] font-mono font-semibold ${statusPillClass(rel.status)}`}
                    >
                      {rel.status}
                    </span>
                    {rel.resolutionType === 'WORKAROUND' && (
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                        Workaround
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 group-hover:text-slate-900 truncate mt-0.5">
                    {rel.title}
                  </p>
                </Link>
                <button
                  type="button"
                  disabled={!canEditRelated || savingRelated}
                  onClick={() =>
                    handleUpdateRelatedTickets(
                      currentRelatedNos.filter((t) => t !== rel.ticketNo),
                      `ยกเลิกการอ้างอิงเคส ${rel.ticketNo} แล้ว`
                    )
                  }
                  title={!canEditRelated ? 'ปิดเคสแล้ว (เฉพาะ Manager)' : 'ลบการอ้างอิง'}
                  aria-label={`Remove ${rel.ticketNo}`}
                  className="w-6 h-6 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-slate-400 flex items-center justify-center text-sm leading-none shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ×
                </button>
              </div>

              {(rel.resolution?.trim() || rel.workaroundNote?.trim()) && canEditRelated && (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => onCopyResolution(rel)}
                    className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white border border-sky-200 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[13px]">content_copy</span>
                    <span>
                      {rel.resolutionType === 'WORKAROUND' || rel.workaroundNote?.trim()
                        ? rel.resolution?.trim()
                          ? 'คัดลอกวิธีแก้ & Workaround'
                          : 'คัดลอก Workaround'
                        : 'คัดลอกวิธีแก้'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500 text-center">
          ยังไม่มีเคสที่อ้างอิง
        </div>
      )}

      {referencedBy.length > 0 && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-600">
            ถูกอ้างอิงโดยเคสใหม่ ({referencedBy.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {referencedBy.map((ref) => (
              <Link
                key={ref.ticketNo}
                href={`/admin/incidents/${ref.ticketNo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-200 text-[11px] transition-colors"
              >
                <span className="font-mono font-bold text-sky-700 shrink-0">{ref.ticketNo}</span>
                <span className="text-slate-600 truncate max-w-[140px]">{ref.title}</span>
                <span
                  className={`px-1.5 py-px rounded border text-[9px] font-mono font-semibold shrink-0 ${statusPillClass(ref.status)}`}
                >
                  {ref.status}
                </span>
                <span className="material-symbols-outlined text-[12px] text-sky-600 shrink-0">open_in_new</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
