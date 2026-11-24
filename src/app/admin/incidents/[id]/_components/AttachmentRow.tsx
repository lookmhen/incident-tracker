'use client';

import {
  getAttachmentIcon,
  isImageAttachment,
  isPdfAttachment,
} from '@/lib/attachments';
import type { IncidentAttachment } from './types';
import { attName, formatFileSize } from './utils';

interface AttachmentRowProps {
  att: IncidentAttachment;
  tone: 'sky' | 'emerald';
  isClosed: boolean;
  isDeleting: boolean;
  onPreview: (att: IncidentAttachment) => void;
  onDelete: (att: IncidentAttachment) => void;
}

export default function AttachmentRow({
  att,
  tone,
  isClosed,
  isDeleting,
  onPreview,
  onDelete,
}: AttachmentRowProps) {
  const name = attName(att);
  const canPreview = isImageAttachment(name, att.fileType) || isPdfAttachment(name, att.fileType);
  const iconName = getAttachmentIcon(name, att.fileType);
  const boxStyle =
    tone === 'emerald'
      ? 'bg-emerald-50/50 border-emerald-200/80 hover:bg-emerald-50'
      : 'bg-sky-50/60 border-sky-200/80 hover:bg-sky-50';
  const iconStyle =
    tone === 'emerald'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
      : 'bg-sky-50 border-sky-200 text-sky-600';

  return (
    <div
      className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-colors ${boxStyle}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${iconStyle}`}>
          <span className="material-symbols-outlined text-[20px]">{iconName}</span>
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-800 font-mono truncate">{name}</div>
          <div className="text-[11px] text-slate-500">
            {att.fileType}
            {att.fileSize != null && ` • ${formatFileSize(att.fileSize)}`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {canPreview ? (
          <button
            type="button"
            onClick={() => onPreview(att)}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-sky-600 hover:text-white hover:border-sky-600 text-xs text-slate-700 font-medium flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">visibility</span>
            <span>Preview</span>
          </button>
        ) : (
          <a
            href={att.fileUrl}
            download={name}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-sky-600 hover:text-white hover:border-sky-600 text-xs text-slate-700 font-medium flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">download</span>
            <span>Download</span>
          </a>
        )}
        {!isClosed && (
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => onDelete(att)}
            title="ลบไฟล์แนบ"
            className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-slate-400 transition-colors cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[15px]">delete</span>
          </button>
        )}
      </div>
    </div>
  );
}
