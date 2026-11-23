'use client';

import { useState } from 'react';
import type { IncidentDetail } from './types';
import { formatDuration, toLocalDateTimeInput } from './utils';

interface LifecycleDurationCardProps {
  incident: IncidentDetail;
  isClosed: boolean;
  isOnHold: boolean;
  isPendingConfirm: boolean;
  isManager: boolean;
  nowMs: number;
  onIncidentUpdated: (updated: IncidentDetail) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function LifecycleDurationCard({
  incident,
  isClosed,
  isOnHold,
  isPendingConfirm,
  isManager,
  nowMs,
  onIncidentUpdated,
  showToast,
}: LifecycleDurationCardProps) {
  const [editingTimeField, setEditingTimeField] = useState<'createdAt' | 'closedAt' | null>(null);
  const [editTimeValue, setEditTimeValue] = useState('');
  const [savingTime, setSavingTime] = useState(false);

  const [prevTicketNo, setPrevTicketNo] = useState(incident.ticketNo);
  const [prevStatus, setPrevStatus] = useState(incident.status);
  const [prevAssignedTo, setPrevAssignedTo] = useState(incident.assignedTo);
  if (
    prevTicketNo !== incident.ticketNo ||
    prevStatus !== incident.status ||
    prevAssignedTo !== incident.assignedTo
  ) {
    setPrevTicketNo(incident.ticketNo);
    setPrevStatus(incident.status);
    setPrevAssignedTo(incident.assignedTo);
    setEditingTimeField(null);
  }

  const handleSaveTimestamp = async () => {
    if (!incident || !editingTimeField || !editTimeValue) return;
    const parsed = new Date(editTimeValue);
    if (Number.isNaN(parsed.getTime())) {
      showToast('รูปแบบวันเวลาไม่ถูกต้อง', 'error');
      return;
    }
    if (editingTimeField === 'closedAt' && parsed.getTime() < new Date(incident.createdAt).getTime()) {
      showToast('วันเวลาปิดเคสต้องไม่ก่อนเวลาเปิดเคส', 'error');
      return;
    }
    if (
      editingTimeField === 'createdAt' &&
      incident.closedAt &&
      parsed.getTime() > new Date(incident.closedAt).getTime()
    ) {
      showToast('วันเวลาเปิดเคสต้องไม่หลังเวลาปิดเคส', 'error');
      return;
    }
    setSavingTime(true);
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [editingTimeField]: parsed.toISOString() }),
      });
      if (res.ok) {
        const updated = await res.json();
        onIncidentUpdated(updated);
        const label = editingTimeField === 'createdAt' ? 'เปิดเคส' : 'ปิดเคส';
        setEditingTimeField(null);
        showToast(`อัปเดตวันเวลา${label}เรียบร้อยแล้ว`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถอัปเดตวันเวลาได้', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('เกิดข้อผิดพลาดในการบันทึก', 'error');
    } finally {
      setSavingTime(false);
    }
  };

  const handleToggleMttrExcluded = async () => {
    if (!incident) return;
    const nextVal = !incident.mttrExcluded;
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mttrExcluded: nextVal }),
      });
      if (res.ok) {
        const updated = await res.json();
        onIncidentUpdated(updated);
        showToast(nextVal ? 'ตั้งค่าไม่นำเคสนี้ไปคำนวณ MTTR แล้ว' : 'นำเคสนี้กลับเข้าคำนวณ MTTR แล้ว');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const renderTimeEditor = (bounds: { min?: string; max?: string }, ringClass: string, btnClass: string) => (
    <div className="space-y-1.5 pt-0.5">
      <input
        type="datetime-local"
        value={editTimeValue}
        min={bounds.min}
        max={bounds.max}
        onChange={(e) => setEditTimeValue(e.target.value)}
        className={`w-full px-2 py-1 rounded-lg border bg-white text-[11px] font-mono text-slate-900 focus:outline-none focus:ring-1 ${ringClass}`}
      />
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setEditingTimeField(null)}
          className="px-2 py-0.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-[10px] text-slate-600 cursor-pointer"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          disabled={savingTime || !editTimeValue}
          onClick={handleSaveTimestamp}
          className={`px-2 py-0.5 rounded-md text-white text-[10px] font-semibold cursor-pointer disabled:opacity-50 ${btnClass}`}
        >
          {savingTime ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.05)] border border-sky-100 space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
            <span className="material-symbols-outlined text-[18px]">timer</span>
          </span>
          <div>
            <h3 className="text-xs font-headline font-bold text-slate-900">
              Lifecycle &amp; Duration Tracking
            </h3>
            <p className="text-[11px] text-slate-500">การติดตามระยะเวลาดำเนินงานของเคส</p>
          </div>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold font-mono ${
            isClosed
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : isOnHold
              ? 'bg-violet-50 text-violet-700 border border-violet-200'
              : isPendingConfirm
              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}
        >
          {isClosed ? 'RESOLVED' : isOnHold ? 'ON HOLD' : isPendingConfirm ? 'PENDING CONFIRM' : 'ACTIVE'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 text-xs">
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
              เปิดเคสเมื่อ (Created)
            </span>
            {!isClosed && editingTimeField !== 'createdAt' && (
              <button
                type="button"
                onClick={() => {
                  setEditTimeValue(toLocalDateTimeInput(incident.createdAt));
                  setEditingTimeField('createdAt');
                }}
                className="text-[10px] font-semibold text-sky-700 hover:text-sky-900 flex items-center gap-0.5 cursor-pointer"
                title="แก้ไขวันเวลาเปิดเคส"
              >
                <span className="material-symbols-outlined text-[13px]">edit</span>
                <span>แก้ไข</span>
              </button>
            )}
          </div>
          {editingTimeField === 'createdAt' ? (
            renderTimeEditor(
              { max: incident.closedAt ? toLocalDateTimeInput(incident.closedAt) : undefined },
              'border-sky-300 focus:ring-sky-500',
              'bg-sky-600 hover:bg-sky-700'
            )
          ) : (
            <>
              <div className="font-semibold text-slate-800 font-mono">
                {new Date(incident.createdAt).toLocaleDateString('th-TH')}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                {new Date(incident.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
              </div>
            </>
          )}
        </div>

        <div
          className={`p-3 rounded-xl border space-y-1 ${
            isClosed
              ? 'bg-emerald-50/60 border-emerald-200/80'
              : isOnHold
              ? 'bg-violet-50/60 border-violet-200/80'
              : 'bg-sky-50/60 border-sky-200/80'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
              {isClosed ? 'ปิดเคสเมื่อ (Closed)' : 'สถานะเวลาปัจจุบัน'}
            </span>
            {isClosed && isManager && editingTimeField !== 'closedAt' && (
              <button
                type="button"
                onClick={() => {
                  setEditTimeValue(toLocalDateTimeInput(incident.closedAt || new Date().toISOString()));
                  setEditingTimeField('closedAt');
                }}
                className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-0.5 cursor-pointer"
                title="แก้ไขวันเวลาปิดเคส"
              >
                <span className="material-symbols-outlined text-[13px]">edit</span>
                <span>แก้ไข</span>
              </button>
            )}
          </div>
          {isClosed ? (
            editingTimeField === 'closedAt' ? (
              renderTimeEditor(
                { min: toLocalDateTimeInput(incident.createdAt) },
                'border-emerald-300 focus:ring-emerald-500',
                'bg-emerald-600 hover:bg-emerald-700'
              )
            ) : (
              <>
                <div className="font-semibold text-emerald-800 font-mono">
                  {incident.closedAt ? new Date(incident.closedAt).toLocaleDateString('th-TH') : '-'}
                </div>
                <div className="text-[11px] text-emerald-600 font-mono">
                  {incident.closedAt
                    ? `${new Date(incident.closedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
                    : '-'}
                </div>
              </>
            )
          ) : isOnHold ? (
            <>
              <div className="font-semibold text-violet-800 flex items-center gap-1.5 font-mono">
                <span className="w-2 h-2 rounded-full bg-violet-500"></span>
                พักรอ Solution
              </div>
              <div className="text-[11px] text-violet-600">
                หยุดนับคิวค้างและไม่รวมใน MTTR
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold text-sky-800 flex items-center gap-1.5 font-mono">
                <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
                Active Counting
              </div>
              <div className="text-[11px] text-slate-500">
                นับเวลาต่อเนื่องจนกว่าจะปิดเคส
              </div>
            </>
          )}
        </div>
      </div>

      {/* Summary Duration Banner */}
      <div
        className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
          isClosed
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : isOnHold
            ? 'bg-violet-50 border-violet-200 text-violet-900'
            : 'bg-gradient-to-r from-sky-50 to-blue-50 border-sky-200 text-sky-900'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">
            {isClosed ? 'task_alt' : isOnHold ? 'pause_circle' : 'timelapse'}
          </span>
          <span className="font-medium">
            {isClosed
              ? 'ระยะเวลาแก้ไขทั้งหมด:'
              : isOnHold
              ? 'พักรอ Solution (On Hold):'
              : 'เปิดเคสมาแล้วเป็นเวลา:'}
          </span>
        </div>
        <div className="text-sm font-bold font-mono">
          {formatDuration(incident.createdAt, incident.closedAt, nowMs)}
        </div>
      </div>

      {(isOnHold || isClosed || incident.mttrExcluded) && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px]">
          <span className="text-slate-600 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-violet-600">
              {incident.mttrExcluded ? 'timer_off' : 'timer'}
            </span>
            {incident.mttrExcluded
              ? `ไม่นำไปคำนวณค่าเฉลี่ย MTTR (${incident.resolvedByExternal ? 'External User' : 'เคย On Hold'})`
              : 'นับรวมในค่าเฉลี่ย MTTR'}
          </span>
          {(!isClosed || isManager) && (
            <button
              type="button"
              onClick={handleToggleMttrExcluded}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold cursor-pointer shrink-0"
            >
              {incident.mttrExcluded ? 'นับเข้า MTTR' : 'ยกเว้น MTTR'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
