'use client';

import { useState } from 'react';
import DepartmentInput from '@/components/DepartmentInput';
import type { IncidentDetail } from './types';
import { formatDuration, normStatus, statusPillClass } from './utils';

interface IncidentHeaderCardProps {
  incident: IncidentDetail;
  isClosed: boolean;
  isManager: boolean;
  isMutatingStatus: boolean;
  nowMs: number;
  onIncidentUpdated: (updated: IncidentDetail) => void;
  onAssignToMe: () => void;
  onUpdateStatus: (newStatus: string, extra?: Record<string, unknown>) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function IncidentHeaderCard({
  incident,
  isClosed,
  isManager,
  isMutatingStatus,
  nowMs,
  onIncidentUpdated,
  onAssignToMe,
  onUpdateStatus,
  showToast,
}: IncidentHeaderCardProps) {
  const [isEditingReporter, setIsEditingReporter] = useState(false);
  const [editReporterName, setEditReporterName] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editContactInfo, setEditContactInfo] = useState('');
  const [savingReporter, setSavingReporter] = useState(false);
  const [updatingUrgency, setUpdatingUrgency] = useState(false);

  const [prevTicketNo, setPrevTicketNo] = useState(incident.ticketNo);
  const [prevIsClosed, setPrevIsClosed] = useState(isClosed || isManager);
  if (prevTicketNo !== incident.ticketNo || prevIsClosed !== (isClosed || isManager)) {
    setPrevTicketNo(incident.ticketNo);
    setPrevIsClosed(isClosed || isManager);
    if (prevTicketNo !== incident.ticketNo || isClosed || isManager) {
      setIsEditingReporter(false);
    }
  }

  const handleUpdateUrgency = async (newUrgency: 'HIGH' | 'MEDIUM' | 'LOW') => {
    if (!incident || isClosed || updatingUrgency || incident.urgency === newUrgency) return;
    setUpdatingUrgency(true);
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urgency: newUrgency }),
      });
      if (res.ok) {
        const updated = await res.json();
        onIncidentUpdated(updated);
        showToast(`ปรับระดับความสำคัญเป็น ${newUrgency} เรียบร้อยแล้ว`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถปรับระดับความสำคัญได้', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
    } finally {
      setUpdatingUrgency(false);
    }
  };

  const handleSaveReporter = async () => {
    if (!incident || savingReporter) return;
    if (!editReporterName.trim() || !editContactInfo.trim()) {
      showToast('กรุณาระบุ Name และ Contact ให้ครบถ้วน', 'error');
      return;
    }
    setSavingReporter(true);
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterName: editReporterName.trim(),
          department: editDepartment.trim() || null,
          contactInfo: editContactInfo.trim(),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onIncidentUpdated(updated);
        setIsEditingReporter(false);
        showToast('บันทึกข้อมูลผู้แจ้งและแผนกเรียบร้อยแล้ว');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถบันทึกข้อมูลผู้แจ้งได้', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
    } finally {
      setSavingReporter(false);
    }
  };

  const isHigh = incident.urgency === 'HIGH';
  const statusKey = normStatus(incident.status);
  const isOnHold = statusKey === 'ON_HOLD';
  const isPendingConfirm = statusKey === 'PENDING_CONFIRM';

  return (
    <section className="relative z-20 bg-white/95 backdrop-blur-xl rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.06)] border border-sky-100">
      <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl bg-gradient-to-r from-sky-400 via-blue-500 to-sky-300"></div>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {isClosed || isManager ? (
              isHigh ? (
                <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-semibold flex items-center gap-1.5 shadow-xs" title={isClosed ? 'ปิดเคสแล้ว ไม่สามารถแก้ไขได้' : 'Manager Read-Only'}>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                  HIGH URGENCY
                </span>
              ) : incident.urgency === 'LOW' ? (
                <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-semibold flex items-center gap-1.5" title={isClosed ? 'ปิดเคสแล้ว ไม่สามารถแก้ไขได้' : 'Manager Read-Only'}>
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                  LOW URGENCY
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold flex items-center gap-1.5" title={isClosed ? 'ปิดเคสแล้ว ไม่สามารถแก้ไขได้' : 'Manager Read-Only'}>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  MEDIUM URGENCY
                </span>
              )
            ) : (
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50/80 p-0.5 shadow-2xs">
                {(['LOW', 'MEDIUM', 'HIGH'] as const).map((lvl) => {
                  const isCurr = incident.urgency === lvl;
                  const activeCls =
                    lvl === 'HIGH'
                      ? 'bg-red-600 text-white shadow-xs font-bold'
                      : lvl === 'MEDIUM'
                      ? 'bg-amber-500 text-white shadow-xs font-bold'
                      : 'bg-sky-600 text-white shadow-xs font-bold';
                  const idleCls = 'text-slate-600 hover:text-slate-900 hover:bg-white/60';
                  return (
                    <button
                      key={lvl}
                      type="button"
                      disabled={updatingUrgency}
                      onClick={() => handleUpdateUrgency(lvl)}
                      className={`px-2 py-0.5 rounded-md text-[11px] transition-all cursor-pointer disabled:opacity-50 ${
                        isCurr ? activeCls : idleCls
                      }`}
                      title={`เปลี่ยนระดับเป็น ${lvl}`}
                    >
                      {lvl === 'HIGH' && isCurr && <span className="inline-block w-1 h-1 rounded-full bg-white mr-1 animate-ping align-middle"></span>}
                      {lvl}
                    </button>
                  );
                })}
              </div>
            )}

            <span
              className={`px-2.5 py-1 rounded-full border font-semibold flex items-center gap-1 ${statusPillClass(statusKey)}`}
            >
              <span className="material-symbols-outlined text-[14px]">
                {isClosed ? 'check_circle' : isOnHold ? 'pause_circle' : isPendingConfirm ? 'pending_actions' : 'sync'}
              </span>
              {isPendingConfirm ? 'รอ Manager ยืนยันปิดเคส' : statusKey}
            </span>

            {incident.resolutionType === 'WORKAROUND' && (
              <span
                title={incident.workaroundNote || undefined}
                className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-semibold flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">build_circle</span>
                Workaround / มีเงื่อนไข
              </span>
            )}

            {incident.resolvedByExternal && (
              <span className="px-2.5 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-300 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">person_check</span>
                External User
              </span>
            )}

            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200">
              {incident.category || 'Uncategorized'}
            </span>

            {incident.rootCause && (
              <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                RCA: {incident.rootCause}
              </span>
            )}

            <span className="text-slate-500 flex items-center gap-1 font-mono">
              <span className="material-symbols-outlined text-[15px]">schedule</span>
              Logged {new Date(incident.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
            </span>

            {isClosed ? (
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1 shadow-2xs">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                <span>แก้ไขสำเร็จใน {formatDuration(incident.createdAt, incident.closedAt, nowMs)}</span>
              </span>
            ) : isOnHold ? (
              <span className="px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-semibold flex items-center gap-1 shadow-2xs">
                <span className="material-symbols-outlined text-[14px]">pause_circle</span>
                <span>On Hold • รอ Solution (ไม่คิด MTTR)</span>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200 font-semibold flex items-center gap-1 shadow-2xs">
                <span className="material-symbols-outlined text-[14px] text-sky-600 animate-spin" style={{ animationDuration: '8s' }}>
                  timelapse
                </span>
                <span>เปิดมาแล้ว {formatDuration(incident.createdAt, undefined, nowMs)}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-headline font-bold text-slate-900 tracking-tight leading-snug break-words">
              <span className="text-sky-600 font-mono select-all">[{incident.ticketNo}]</span> {incident.title}
            </h1>
          </div>

          {isEditingReporter ? (
            <div className="p-3 rounded-xl bg-sky-50/60 border border-sky-200 space-y-2.5 max-w-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Name (ชื่อผู้แจ้ง)</label>
                  <input
                    type="text"
                    value={editReporterName}
                    onChange={(e) => setEditReporterName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveReporter();
                      if (e.key === 'Escape') setIsEditingReporter(false);
                    }}
                    placeholder="ชื่อผู้แจ้ง"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Dept. (แผนก)</label>
                  <DepartmentInput
                    value={editDepartment}
                    onChange={setEditDepartment}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveReporter();
                      if (e.key === 'Escape') setIsEditingReporter(false);
                    }}
                    placeholder="เช่น Packing, Finance, IT..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">Contact (ติดต่อ)</label>
                  <input
                    type="text"
                    value={editContactInfo}
                    onChange={(e) => setEditContactInfo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveReporter();
                      if (e.key === 'Escape') setIsEditingReporter(false);
                    }}
                    placeholder="Email / เบอร์ต่อ"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={savingReporter}
                  onClick={() => setIsEditingReporter(false)}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-medium cursor-pointer disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={savingReporter || !editReporterName.trim() || !editContactInfo.trim()}
                  onClick={handleSaveReporter}
                  className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[14px]">save</span>
                  <span>{savingReporter ? 'กำลังบันทึก...' : 'บันทึก'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-sky-600">account_circle</span>
                <span className="text-slate-400 font-medium">Name:</span>
                <span className="text-slate-900 font-semibold">{incident.reporterName}</span>
              </div>
              <span className="hidden sm:inline text-slate-300">•</span>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-sky-600">corporate_fare</span>
                <span className="text-slate-400 font-medium">Dept.:</span>
                <span className="text-slate-800 font-semibold">{incident.department || 'General'}</span>
              </div>
              <span className="hidden sm:inline text-slate-300">•</span>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-sky-600">contact_phone</span>
                <span className="text-slate-400 font-medium">Contact:</span>
                <span className="text-slate-700">{incident.contactInfo}</span>
              </div>
              {!isManager && (
                <button
                  type="button"
                  onClick={() => {
                    setEditReporterName(incident.reporterName);
                    setEditDepartment(incident.department || '');
                    setEditContactInfo(incident.contactInfo);
                    setIsEditingReporter(true);
                  }}
                  className="px-2 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                  title="แก้ไขชื่อผู้แจ้ง แผนก หรือข้อมูลติดต่อ"
                >
                  <span className="material-symbols-outlined text-[13px]">edit</span>
                  <span>แก้ไข</span>
                </button>
              )}
              {isClosed && incident.resolvedBy && (
                <>
                  <span className="hidden sm:inline text-slate-300">•</span>
                  <div className="flex items-center gap-1 text-emerald-700 font-medium">
                    <span className="material-symbols-outlined text-[15px]">verified</span>
                    <span>Resolved by: {incident.resolvedBy}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {incident.resolutionType === 'WORKAROUND' && incident.workaroundNote && (
            <div className="px-3 py-2 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] text-amber-600 shrink-0 mt-0.5">warning</span>
              <div>
                <span className="font-semibold">Workaround Note: </span>
                <span>{incident.workaroundNote}</span>
              </div>
            </div>
          )}

          {incident.managerComment && (
            <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] text-slate-500 shrink-0 mt-0.5">comment</span>
              <div>
                <span className="font-semibold">ความเห็น Manager: </span>
                <span className="whitespace-pre-wrap">{incident.managerComment}</span>
              </div>
            </div>
          )}
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2.5 shrink-0 self-start lg:self-center">
          {isManager ? (
            incident.assignedTo && (
              <span className="px-3.5 py-2 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-sky-600">assignment_ind</span>
                <span>Assigned: {incident.assignedTo}</span>
              </span>
            )
          ) : (
            <>
              {statusKey === 'OPEN' ? (
                <button
                  type="button"
                  onClick={onAssignToMe}
                  disabled={isMutatingStatus}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-sm shadow-sky-600/20 cursor-pointer"
                  title="กดรับเคสนี้ และเปลี่ยนสถานะเป็น IN_PROGRESS ทันที"
                >
                  <span className="material-symbols-outlined text-[16px]">pan_tool</span>
                  <span>Claim Ticket (รับเคส)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onAssignToMe}
                  disabled={isMutatingStatus || isClosed}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-2 transition-all shadow-xs cursor-pointer"
                  title={isClosed ? 'ปิดเคสแล้ว — Manager ต้องกด Reopen ก่อนจึงจะแก้ไขได้' : 'คลิกเพื่อ Re-assign เคสนี้ให้ตนเอง'}
                >
                  <span className="material-symbols-outlined text-[16px] text-sky-600">assignment_ind</span>
                  <span>{incident.assignedTo ? `Assigned: ${incident.assignedTo}` : 'Assign to Me'}</span>
                </button>
              )}

              {statusKey === 'IN_PROGRESS' && (
                <button
                  type="button"
                  disabled={isMutatingStatus}
                  onClick={() => onUpdateStatus('ON_HOLD')}
                  className="px-3.5 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 disabled:opacity-60 disabled:cursor-not-allowed text-violet-700 border border-violet-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  title="พักเคสรอ Solution และหยุดนับ MTTR"
                >
                  <span className="material-symbols-outlined text-[16px]">pause_circle</span>
                  <span>พักเคส (On Hold)</span>
                </button>
              )}

              {statusKey === 'ON_HOLD' && (
                <button
                  type="button"
                  disabled={isMutatingStatus}
                  onClick={() => onUpdateStatus('IN_PROGRESS')}
                  className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shadow-sky-600/20 cursor-pointer"
                  title="กลับมาดำเนินการต่อ (IN_PROGRESS)"
                >
                  <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                  <span>กลับมาทำต่อ (Resume)</span>
                </button>
              )}
            </>
          )}

          {isClosed && isManager && (
            <button
              type="button"
              disabled={isMutatingStatus}
              onClick={() => {
                if (window.confirm('ต้องการเปิดเคสนี้กลับเป็น IN_PROGRESS เพื่อแก้ไขเพิ่มเติมใช่ไหม?')) {
                  onUpdateStatus('IN_PROGRESS');
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 disabled:opacity-60 disabled:cursor-not-allowed text-amber-800 border border-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="เปิดเคสกลับเป็น IN_PROGRESS เพื่อแก้ไขเพิ่มเติม (เฉพาะ Manager)"
            >
              <span className="material-symbols-outlined text-[16px]">lock_open</span>
              <span>เปิดเคสใหม่ (Reopen)</span>
            </button>
          )}

          <a
            href={`/api/mcp/v1/context?ticketNo=${incident.ticketNo}`}
            target="_blank"
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-all"
            title="Inspect raw MCP context payload for this ticket"
          >
            <span className="material-symbols-outlined text-[16px]">data_object</span>
            <span>View MCP Payload</span>
          </a>
        </div>
      </div>
    </section>
  );
}
