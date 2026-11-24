'use client';

import { useState } from 'react';
import type { IncidentDetail } from './types';

interface IncidentDetailsCardProps {
  incident: IncidentDetail;
  isClosed: boolean;
  isManager: boolean;
  onIncidentUpdated: (updated: IncidentDetail) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function IncidentDetailsCard({
  incident,
  isClosed,
  isManager,
  onIncidentUpdated,
  showToast,
}: IncidentDetailsCardProps) {
  const isReadOnly = isClosed || isManager;
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  const [prevTicketNo, setPrevTicketNo] = useState(incident.ticketNo);
  const [prevIsClosed, setPrevIsClosed] = useState(isReadOnly);
  if (prevTicketNo !== incident.ticketNo || prevIsClosed !== isReadOnly) {
    setPrevTicketNo(incident.ticketNo);
    setPrevIsClosed(isReadOnly);
    if (prevTicketNo !== incident.ticketNo || isReadOnly) {
      setIsEditingDetails(false);
    }
  }

  const handleSaveDetails = async () => {
    if (!incident || !editTitle.trim() || !editDescription.trim()) return;
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onIncidentUpdated(updated);
        setIsEditingDetails(false);
        showToast('บันทึกการแก้ไขหัวข้อและรายละเอียดเคสเรียบร้อยแล้ว');
      } else {
        showToast('ไม่สามารถบันทึกการแก้ไขได้');
      }
    } catch (e) {
      console.error(e);
      showToast('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSavingDetails(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.05)] border border-sky-100 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
            <span className="material-symbols-outlined text-[20px]">feed</span>
          </span>
          <div>
            <h2 className="text-sm font-headline font-bold text-slate-900">Incident Details &amp; User Submission</h2>
            <p className="text-[11px] text-slate-500">รายละเอียดปัญหาและข้อความที่ผู้ใช้แจ้งเข้ามา</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isClosed ? (
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-600 flex items-center gap-1">
              🔒 Locked หลังปิดเคส
            </span>
          ) : isManager ? (
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-600 flex items-center gap-1">
              👁️ Read-Only (Manager)
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!isEditingDetails) {
                  setEditTitle(incident.title);
                  setEditDescription(incident.description);
                }
                setIsEditingDetails(!isEditingDetails);
              }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                isEditingDetails
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">
                {isEditingDetails ? 'close' : 'edit_note'}
              </span>
              <span>{isEditingDetails ? 'Cancel' : 'Edit Details / แก้ไขข้อความ'}</span>
            </button>
          )}
          <span className="px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-[11px] font-mono font-medium text-slate-600">
            RAW-{incident.ticketNo}
          </span>
        </div>
      </div>

      {isEditingDetails && !isReadOnly ? (
        /* Edit Mode */
        <div className="space-y-3.5 bg-sky-50/40 p-4 rounded-xl border border-sky-200">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-800">หัวข้อปัญหา (Problem Title)</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-800">รายละเอียดปัญหา (Description)</label>
            <textarea
              rows={5}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs leading-relaxed text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsEditingDetails(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={savingDetails || !editTitle.trim() || !editDescription.trim()}
              onClick={handleSaveDetails}
              className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[15px]">save</span>
              <span>{savingDetails ? 'Saving...' : 'Save Changes / บันทึกการแก้ไข'}</span>
            </button>
          </div>
        </div>
      ) : (
        /* View Mode */
        <div className="bg-slate-50/90 border border-slate-200 rounded-xl p-4 text-xs text-slate-800 leading-relaxed space-y-2 select-text">
          <div className="text-slate-900 font-semibold bg-white p-2.5 rounded-lg border border-slate-200/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 block mb-0.5">Problem Title:</span>
            {incident.title}
          </div>
          <div className="text-slate-700 p-2.5 bg-white/70 rounded-lg border border-slate-200/60 whitespace-pre-wrap">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 block mb-0.5">Description:</span>
            {incident.description}
          </div>
        </div>
      )}
    </div>
  );
}
