'use client';

import { isImageAttachment, isPdfAttachment } from '@/lib/attachments';
import type { IncidentAttachment } from './types';
import { attName } from './utils';

interface AttachmentPreviewModalProps {
  attachment: IncidentAttachment | null;
  onClose: () => void;
}

export default function AttachmentPreviewModal({
  attachment,
  onClose,
}: AttachmentPreviewModalProps) {
  if (!attachment) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-sky-600">attachment</span>
            <span className="text-sm font-bold text-slate-900 font-mono truncate">{attName(attachment)}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                attachment.kind === 'RESOLUTION'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-sky-50 text-sky-700 border border-sky-200'
              }`}
            >
              {attachment.kind === 'RESOLUTION' ? 'หลักฐานปิดงาน' : 'ไฟล์ฝั่งผู้แจ้ง'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors shrink-0"
            aria-label="Close preview"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {isImageAttachment(attName(attachment), attachment.fileType) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.fileUrl}
            alt={attName(attachment)}
            className="max-h-[70vh] w-full object-contain rounded-xl border border-slate-200 bg-slate-50"
          />
        ) : isPdfAttachment(attName(attachment), attachment.fileType) ? (
          <iframe
            src={attachment.fileUrl}
            title={attName(attachment)}
            className="w-full h-[70vh] rounded-xl border border-slate-200 bg-slate-50"
          />
        ) : (
          <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-600">
            ไม่สามารถแสดงตัวอย่างไฟล์ประเภท {attachment.fileType} ได้ กรุณากด Open / Download ด้านล่าง
          </div>
        )}

        <div className="flex items-center justify-between text-xs pt-2">
          <a
            href={attachment.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            Open / Download
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-sky-600 text-white font-semibold text-xs hover:bg-sky-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
