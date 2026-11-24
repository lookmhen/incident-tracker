'use client';

import { useRef, type ClipboardEvent } from 'react';
import { ATTACHMENT_ACCEPT } from '@/lib/attachments';
import AttachmentRow from './AttachmentRow';
import type { IncidentAttachment } from './types';

interface ReportAttachmentsCardProps {
  attachments: IncidentAttachment[];
  isClosed: boolean;
  isManager: boolean;
  uploadingKind: 'REPORT' | 'RESOLUTION' | null;
  deletingAttId: string | null;
  onUpload: (files: FileList | File[], kind: 'REPORT' | 'RESOLUTION') => void;
  onPaste: (e: ClipboardEvent, kind: 'REPORT' | 'RESOLUTION') => void;
  onPreview: (att: IncidentAttachment) => void;
  onDelete: (att: IncidentAttachment) => void;
}

export default function ReportAttachmentsCard({
  attachments,
  isClosed,
  isManager,
  uploadingKind,
  deletingAttId,
  onUpload,
  onPaste,
  onPreview,
  onDelete,
}: ReportAttachmentsCardProps) {
  const reportFileRef = useRef<HTMLInputElement>(null);
  const isReadOnly = isClosed || isManager;

  return (
    <div
      tabIndex={0}
      onPaste={(e) => {
        if (!isReadOnly) onPaste(e, 'REPORT');
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        if (!isReadOnly && e.dataTransfer.files?.length) {
          e.preventDefault();
          onUpload(e.dataTransfer.files, 'REPORT');
        }
      }}
      className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.05)] border border-sky-100 space-y-3.5 focus:outline-none focus:ring-2 focus:ring-sky-300"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
            <span className="material-symbols-outlined text-[18px]">attachment</span>
          </span>
          <div>
            <h3 className="text-xs font-headline font-bold text-slate-900">
              Diagnostics &amp; Evidence (ฝั่งผู้แจ้ง)
            </h3>
            <p className="text-[11px] text-slate-500">
              {attachments.length} attachment file(s)
              {!isReadOnly ? ' • รูปภาพ, PDF, Excel, Word, ZIP หรือ Ctrl+V' : ''}
            </p>
          </div>
        </div>
        {!isReadOnly && (
          <>
            <input
              ref={reportFileRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) onUpload(e.target.files, 'REPORT');
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={uploadingKind === 'REPORT'}
              onClick={() => reportFileRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white border border-sky-200 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 shrink-0"
            >
              <span className="material-symbols-outlined text-[15px]">
                {uploadingKind === 'REPORT' ? 'sync' : 'attach_file'}
              </span>
              <span>{uploadingKind === 'REPORT' ? 'กำลังอัปโหลด...' : '+ แนบไฟล์'}</span>
            </button>
          </>
        )}
      </div>

      {attachments.length > 0 ? (
        attachments.map((att) => (
          <AttachmentRow
            key={att.id}
            att={att}
            tone="sky"
            isClosed={isReadOnly}
            isDeleting={deletingAttId === att.id}
            onPreview={onPreview}
            onDelete={onDelete}
          />
        ))
      ) : (
        <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500 text-center">
          {isReadOnly ? 'ไม่มีไฟล์แนบจากผู้แจ้ง' : 'ไม่มีไฟล์แนบจากผู้แจ้ง — กด "+ แนบไฟล์" หรือวางรูปเพิ่มภายหลังได้'}
        </div>
      )}
    </div>
  );
}
