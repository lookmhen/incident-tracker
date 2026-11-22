'use client';

import { useRef, type ClipboardEvent } from 'react';
import { ATTACHMENT_ACCEPT } from '@/lib/attachments';
import AttachmentRow from './AttachmentRow';
import type { IncidentAttachment, IncidentDetail, ResolutionFeedback } from './types';
import { normStatus } from './utils';

interface ResolutionEditorCardProps {
  incident: IncidentDetail;
  isClosed: boolean;
  isManager: boolean;
  isClaimed: boolean;
  isPendingConfirm: boolean;
  isMutatingStatus: boolean;
  savingResolution: boolean;
  resolutionText: string;
  setResolutionText: (v: string) => void;
  resolutionType: 'PERMANENT' | 'WORKAROUND';
  setResolutionType: (v: 'PERMANENT' | 'WORKAROUND') => void;
  workaroundNote: string;
  setWorkaroundNote: (v: string) => void;
  managerComment: string;
  setManagerComment: (v: string) => void;
  resolutionFeedback: ResolutionFeedback | null;
  setResolutionFeedback: (v: ResolutionFeedback | null) => void;
  missingToClose: string[];
  resolutionAttachments: IncidentAttachment[];
  uploadingKind: 'REPORT' | 'RESOLUTION' | null;
  deletingAttId: string | null;
  onUploadAttachments: (files: FileList | File[], kind: 'REPORT' | 'RESOLUTION') => void;
  onPasteImages: (e: ClipboardEvent, kind: 'REPORT' | 'RESOLUTION') => void;
  onPreviewAttachment: (att: IncidentAttachment) => void;
  onDeleteAttachment: (att: IncidentAttachment) => void;
  onSubmitResolution: (targetStatus?: 'PENDING_CONFIRM' | 'RESOLVED') => void;
  onUpdateStatus: (newStatus: string, extra?: Record<string, unknown>) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function ResolutionEditorCard({
  incident,
  isClosed,
  isManager,
  isClaimed,
  isPendingConfirm,
  isMutatingStatus,
  savingResolution,
  resolutionText,
  setResolutionText,
  resolutionType,
  setResolutionType,
  workaroundNote,
  setWorkaroundNote,
  managerComment,
  setManagerComment,
  resolutionFeedback,
  setResolutionFeedback,
  missingToClose,
  resolutionAttachments,
  uploadingKind,
  deletingAttId,
  onUploadAttachments,
  onPasteImages,
  onPreviewAttachment,
  onDeleteAttachment,
  onSubmitResolution,
  onUpdateStatus,
  showToast,
}: ResolutionEditorCardProps) {
  const resolutionFileRef = useRef<HTMLInputElement>(null);

  const statusKey = normStatus(incident.status);
  const charCount = resolutionText.length;
  const wordCount = resolutionText.trim() ? resolutionText.trim().split(/\s+/).length : 0;

  const handleSanitizeText = () => {
    if (!resolutionText.trim()) {
      showToast('ไม่มีข้อความให้จัดฟอร์แมต');
      return;
    }
    const cleaned = resolutionText
      .replace(/<[^>]*>/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[`*#_~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned === resolutionText) {
      showToast('ข้อความสะอาดอยู่แล้ว (ไม่มีแท็ก HTML หรือ Markdown)');
    } else {
      setResolutionText(cleaned);
      showToast('ล้างแท็ก HTML/Markdown และจัดช่องว่างเรียบร้อยแล้ว');
    }
  };

  return (
    <div
      onPaste={(e) => {
        if (!isClosed) onPasteImages(e, 'RESOLUTION');
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        if (!isClosed && e.dataTransfer.files?.length) {
          e.preventDefault();
          onUploadAttachments(e.dataTransfer.files, 'RESOLUTION');
        }
      }}
      className="relative bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.08)] border-2 border-sky-200 space-y-4 overflow-hidden"
    >
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-sky-100/50 rounded-full blur-2xl pointer-events-none"></div>
      {isPendingConfirm && (
        <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-indigo-600">pending_actions</span>
          <span>เคสนี้รอ Manager ตรวจสอบและยืนยันปิดงาน</span>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 border border-sky-200 flex items-center justify-center">
            <span className="material-symbols-outlined text-[20px]">edit_note</span>
          </div>
          <div>
            <h3 className="text-sm font-headline font-bold text-slate-900">
              Resolution &amp; RCA Documentation (Clean Text)
            </h3>
            <p className="text-[11px] text-slate-500">Sanitized plain text notes prepared for external MCP queries</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-[10px] font-mono text-sky-700 font-semibold shadow-inner">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-600"></span>
          <span>{isClosed ? 'Locked (Read-Only)' : 'Clean Text Mode: Active'}</span>
        </div>
      </div>

      {/* Action Helper Tags */}
      {!isClosed && (
        <div className="flex items-center justify-end text-xs">
          <button
            type="button"
            onClick={handleSanitizeText}
            className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-[11px] text-slate-600 hover:text-slate-900 border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[13px]">format_clear</span>
            Sanitize Clean Text
          </button>
        </div>
      )}

      {/* Textarea */}
      <div className="relative">
        <textarea
          rows={6}
          readOnly={isClosed}
          value={resolutionText}
          onChange={(e) => setResolutionText(e.target.value)}
          placeholder="Enter root cause, mitigation, and preventive actions in clean text format..."
          className="w-full bg-slate-50 text-slate-900 border border-slate-200 text-xs font-mono rounded-xl p-4 leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white resize-y transition-all read-only:bg-slate-100/80 read-only:text-slate-600 read-only:cursor-not-allowed"
        />
        <div className="absolute bottom-3 right-3 text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-xs">
          <span>{charCount}</span> characters • {wordCount} words
        </div>
      </div>

      {/* Resolution Evidence Photos (RESOLUTION) */}
      <div className="rounded-xl bg-emerald-50/40 border border-emerald-200/80 p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[17px] text-emerald-600">add_photo_alternate</span>
            <span className="text-xs font-headline font-bold text-slate-800">
              ไฟล์ / รูปหลักฐานการแก้ไข / ปิดงาน ({resolutionAttachments.length})
            </span>
            {!isClosed && (
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                รูปภาพ, PDF, Excel, Word, ZIP • วางรูป (Ctrl+V) หรือลากวางได้
              </span>
            )}
          </div>
          {!isClosed && (
            <>
              <input
                ref={resolutionFileRef}
                type="file"
                accept={ATTACHMENT_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) onUploadAttachments(e.target.files, 'RESOLUTION');
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={uploadingKind === 'RESOLUTION'}
                onClick={() => resolutionFileRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
              >
                <span className="material-symbols-outlined text-[15px]">
                  {uploadingKind === 'RESOLUTION' ? 'sync' : 'upload'}
                </span>
                <span>{uploadingKind === 'RESOLUTION' ? 'กำลังอัปโหลด...' : '+ เพิ่มไฟล์ปิดงาน'}</span>
              </button>
            </>
          )}
        </div>

        {resolutionAttachments.length > 0 && (
          <div className="space-y-2">
            {resolutionAttachments.map((att) => (
              <AttachmentRow
                key={att.id}
                att={att}
                tone="emerald"
                isClosed={isClosed}
                isDeleting={deletingAttId === att.id}
                onPreview={onPreviewAttachment}
                onDelete={onDeleteAttachment}
              />
            ))}
          </div>
        )}
      </div>

      {/* Closure Type Selector */}
      <div className="rounded-xl bg-slate-50/80 border border-slate-200 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-headline font-bold text-slate-800">ประเภทการปิดเคส (Closure Type)</span>
          <span className="text-[11px] text-slate-500">ระบุว่าแก้ไขถาวรหรือปิดแบบมีเงื่อนไข</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isClosed}
            onClick={() => setResolutionType('PERMANENT')}
            className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed ${
              resolutionType === 'PERMANENT'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 disabled:opacity-50'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">task_alt</span>
            <span>แก้ไขถาวร (Permanent)</span>
          </button>
          <button
            type="button"
            disabled={isClosed}
            onClick={() => setResolutionType('WORKAROUND')}
            className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed ${
              resolutionType === 'WORKAROUND'
                ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200 disabled:opacity-50'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">build_circle</span>
            <span>ปิดแบบมีเงื่อนไข / Workaround</span>
          </button>
        </div>
        {resolutionType === 'WORKAROUND' && (
          <div className="pt-1">
            <textarea
              rows={2}
              readOnly={isClosed}
              value={workaroundNote}
              onChange={(e) => setWorkaroundNote(e.target.value)}
              placeholder="เงื่อนไข / งานที่ต้องติดตามต่อ..."
              className="w-full bg-white text-slate-900 border border-amber-300 text-xs rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y read-only:bg-slate-100 read-only:text-slate-600 read-only:cursor-not-allowed"
            />
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="space-y-3 pt-2">
        {!isClosed && missingToClose.length > 0 && (
          <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-amber-600 shrink-0">checklist</span>
            <span>ยังเลือกไม่ครบก่อนปิดเคส: {missingToClose.join(', ')}</span>
          </div>
        )}
        {resolutionFeedback && (
          <div
            role="alert"
            className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
              resolutionFeedback.type === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-800'
                : 'bg-emerald-50 border-emerald-300 text-emerald-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] shrink-0">
                {resolutionFeedback.type === 'error' ? 'error' : 'check_circle'}
              </span>
              <span>{resolutionFeedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setResolutionFeedback(null)}
              className="opacity-60 hover:opacity-100 cursor-pointer"
              aria-label="Dismiss"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}
        {isManager && !isClosed && (
          <div className="space-y-1.5">
            <label
              htmlFor="managerComment"
              className="block text-xs font-semibold text-slate-700"
            >
              ความเห็น Manager (ไม่บังคับ — โน้ตภายใน)
            </label>
            <textarea
              id="managerComment"
              rows={2}
              disabled={isMutatingStatus}
              value={managerComment}
              onChange={(e) => setManagerComment(e.target.value)}
              placeholder="ระบุความคิดเห็นเพิ่มเติมตอนปิดเคส หรือเหตุผลเมื่อกดตีกลับแก้ไข..."
              className="w-full bg-white text-slate-900 border border-slate-300 text-xs rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-sky-400 resize-y disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
            />
          </div>
        )}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-600 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-sky-600">database</span>
            <span>Sanitized plain text stored for Model Context Protocol access</span>
          </div>
          {isManager ? (
            <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
              {isPendingConfirm && (
                <button
                  type="button"
                  disabled={isMutatingStatus}
                  onClick={() => onUpdateStatus('IN_PROGRESS')}
                  className="px-4 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-700 border border-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[16px]">undo</span>
                  <span>ตีกลับแก้ไข (In Progress)</span>
                </button>
              )}
              {isClosed && (
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                  ✓ ปิดเคสแล้ว{incident.resolvedBy ? ` โดย ${incident.resolvedBy}` : ''}
                </span>
              )}
              <button
                type="button"
                disabled={isClosed || isMutatingStatus}
                onClick={() => onSubmitResolution('RESOLVED')}
                className={
                  isClosed
                    ? 'w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-200 text-slate-500 cursor-not-allowed shadow-none text-xs font-bold flex items-center justify-center gap-2'
                    : 'w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(2,132,199,0.35)] hover:shadow-[0_6px_22px_rgba(2,132,199,0.45)] transition-all cursor-pointer disabled:cursor-not-allowed'
                }
              >
                <span className={`material-symbols-outlined text-[18px] ${savingResolution ? 'animate-spin' : ''}`}>
                  {savingResolution ? 'sync' : 'check_circle'}
                </span>
                <span>
                  {savingResolution
                    ? 'กำลังบันทึก...'
                    : isClosed
                      ? `ปิดเคสเรียบร้อยแล้ว (${statusKey})`
                      : 'Confirm & Mark Resolved (ยืนยันปิดเคส)'}
                </span>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
              {isClosed && (
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                  ✓ ปิดเคสแล้ว{incident.resolvedBy ? ` โดย ${incident.resolvedBy}` : ''}
                </span>
              )}
              <button
                type="button"
                disabled={isClosed || isMutatingStatus}
                onClick={() => onSubmitResolution()}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">save</span>
                <span>{savingResolution ? 'กำลังบันทึก...' : 'Save Draft'}</span>
              </button>
              <button
                type="button"
                disabled={!isClaimed || isPendingConfirm || isClosed || isMutatingStatus}
                onClick={() => onSubmitResolution('PENDING_CONFIRM')}
                title={
                  isClosed
                    ? 'ปิดเคสเรียบร้อยแล้ว'
                    : isPendingConfirm
                      ? 'ส่งเคสให้ Manager ยืนยันเรียบร้อยแล้ว'
                      : !isClaimed
                        ? 'กรุณากดปุ่ม Claim Ticket (รับเคส) ด้านบนก่อนส่ง'
                        : undefined
                }
                className={
                  !isClaimed || isPendingConfirm || isClosed
                    ? 'w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-200 text-slate-500 cursor-not-allowed text-xs font-bold flex items-center justify-center gap-2'
                    : 'w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                }
              >
                <span className={`material-symbols-outlined text-[18px] ${savingResolution ? 'animate-spin' : ''}`}>
                  {savingResolution
                    ? 'sync'
                    : isClosed
                      ? 'check_circle'
                      : isPendingConfirm
                        ? 'hourglass_top'
                        : !isClaimed
                          ? 'pan_tool'
                          : 'send'}
                </span>
                <span>
                  {savingResolution
                    ? 'กำลังส่ง...'
                    : isClosed
                      ? `ปิดเคสแล้ว (${statusKey})`
                      : isPendingConfirm
                        ? 'รอ Manager ยืนยันแล้ว (Pending Confirm)'
                        : !isClaimed
                          ? 'กรุณากด Claim รับเคสก่อนส่ง'
                          : 'ส่งให้ Manager ยืนยันปิดเคส'}
                </span>
              </button>
            </div>
          )}
        </div>
        {isClosed && (
          <p className="text-[11px] text-slate-500 text-right">
            หาก Manager ต้องการแก้ไขเพิ่มเติม ให้กดปุ่ม &quot;เปิดเคสใหม่ (Reopen)&quot; ด้านบน
          </p>
        )}
        {!isManager && (
          <p className="text-[11px] text-slate-500 text-right">
            หมายเหตุ: เฉพาะผู้ใช้สิทธิ์ MANAGER เท่านั้นที่สามารถยืนยันปิดเคส (RESOLVED / CLOSED) ได้
          </p>
        )}
      </div>
    </div>
  );
}
