import type { IncidentAttachment, IncidentDetail, RelatedIncidentSummary } from './types';

export function normStatus(status?: string | null): string {
  return (status || '').trim().toUpperCase();
}

export function statusPillClass(status: string): string {
  const s = normStatus(status);
  return s === 'RESOLVED' || s === 'CLOSED'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : s === 'ON_HOLD'
    ? 'bg-violet-50 text-violet-700 border-violet-200'
    : s === 'PENDING_CONFIRM'
    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
    : 'bg-sky-50 text-sky-700 border-sky-200';
}

export function formatDuration(startStr: string, endStr?: string | null, nowMs?: number): string {
  if (!startStr) return '-';
  const start = new Date(startStr).getTime();
  const end = endStr ? new Date(endStr).getTime() : (nowMs ?? Date.now());
  if (Number.isNaN(start) || Number.isNaN(end)) return '-';
  const diffMins = Math.max(0, Math.floor((end - start) / 60000));
  if (diffMins < 1) return 'น้อยกว่า 1 นาที';
  if (diffMins < 60) return `${diffMins} นาที`;
  const hours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;
  if (hours < 24) {
    return remainingMins > 0 ? `${hours} ชม. ${remainingMins} นาที` : `${hours} ชม.`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days} วัน ${remainingHours} ชม.` : `${days} วัน`;
}

export function formatFileSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function attName(att: Pick<IncidentAttachment, 'fileName' | 'fileUrl'>): string {
  return att.fileName || att.fileUrl.split('/').pop() || att.fileUrl;
}

export function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function buildMcpPayload(inc: IncidentDetail, resolutionText: string) {
  return {
    mcp_resource_uri: `mcp://incidenthub/incidents/${inc.ticketNo}`,
    ticketNo: inc.ticketNo,
    category: inc.category || 'General',
    urgency: inc.urgency,
    status: inc.status,
    clean_text_corpus: resolutionText,
  };
}

export function appendTextSnippet(current: string, addition?: string | null): string {
  const next = addition?.trim();
  if (!next) return current;
  return current.trim() ? `${current.trimEnd()}\n${next}` : next;
}

export function applyRelatedResolutionCopy(
  current: {
    resolutionText: string;
    resolutionType: 'PERMANENT' | 'WORKAROUND';
    workaroundNote: string;
  },
  source: Pick<RelatedIncidentSummary, 'resolution' | 'resolutionType' | 'workaroundNote'>
) {
  const waNote = source.workaroundNote?.trim() || '';
  const hasWorkaround = source.resolutionType === 'WORKAROUND' || Boolean(waNote);
  return {
    resolutionText: appendTextSnippet(current.resolutionText, source.resolution),
    resolutionType: hasWorkaround ? ('WORKAROUND' as const) : current.resolutionType,
    workaroundNote: hasWorkaround ? appendTextSnippet(current.workaroundNote, waNote) : current.workaroundNote,
    copiedResolution: Boolean(source.resolution?.trim()),
    copiedWorkaround: hasWorkaround,
  };
}
