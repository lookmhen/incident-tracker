export const MAX_ATTACHMENT_MB = 10;
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.zip': 'application/zip',
};

const ALLOWED_CLIPBOARD_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export const ATTACHMENT_ACCEPT = Object.keys(ALLOWED_ATTACHMENT_MIME_BY_EXT).join(',');
export const ALLOWED_ATTACHMENT_LABEL = 'รูปภาพ, PDF, Excel, Word, PowerPoint, CSV, TXT, LOG, ZIP';

export function getFileExtension(fileName?: string | null): string {
  const clean = (fileName || '').trim().split(/[\\/]/).pop() || '';
  const dot = clean.lastIndexOf('.');
  if (dot <= 0 || dot === clean.length - 1) return '';
  return clean.slice(dot).toLowerCase();
}

export function isAllowedAttachment(fileName?: string | null, mimeType?: string | null): boolean {
  const ext = getFileExtension(fileName);
  if (ext) {
    return Object.prototype.hasOwnProperty.call(ALLOWED_ATTACHMENT_MIME_BY_EXT, ext);
  }
  return Boolean(mimeType && ALLOWED_CLIPBOARD_IMAGE_MIMES.has(mimeType.toLowerCase()));
}

export function resolveAttachmentMime(fileName?: string | null, providedMime?: string | null): string {
  const ext = getFileExtension(fileName);
  if (ext && ALLOWED_ATTACHMENT_MIME_BY_EXT[ext]) {
    return ALLOWED_ATTACHMENT_MIME_BY_EXT[ext];
  }
  return providedMime || 'application/octet-stream';
}

export function isImageAttachment(fileName?: string | null, mimeType?: string | null): boolean {
  const ext = getFileExtension(fileName);
  if (ext) {
    return ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext);
  }
  return Boolean(mimeType && ALLOWED_CLIPBOARD_IMAGE_MIMES.has(mimeType.toLowerCase()));
}

export function isPdfAttachment(fileName?: string | null, mimeType?: string | null): boolean {
  const ext = getFileExtension(fileName);
  if (ext) {
    return ext === '.pdf';
  }
  return (mimeType || '').toLowerCase() === 'application/pdf';
}

export function fallbackAttachmentFileName(mimeType?: string | null): string {
  const m = (mimeType || '').toLowerCase().split(';')[0].trim();
  const ext =
    m === 'image/jpeg'
      ? '.jpg'
      : m === 'image/gif'
        ? '.gif'
        : m === 'image/webp'
          ? '.webp'
          : '.png';
  return `attachment_${Date.now()}${ext}`;
}

export function getAttachmentIcon(fileName?: string | null, mimeType?: string | null): string {
  if (isImageAttachment(fileName, mimeType)) return 'image';
  if (isPdfAttachment(fileName, mimeType)) return 'picture_as_pdf';
  const ext = getFileExtension(fileName);
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return 'table_chart';
  if (['.ppt', '.pptx'].includes(ext)) return 'slideshow';
  if (ext === '.zip') return 'folder_zip';
  return 'description';
}
