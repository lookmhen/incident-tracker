'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface IncidentDetail {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  reporterName: string;
  department: string | null;
  contactInfo: string;
  urgency: string;
  category: string | null;
  categoryId: string | null;
  rootCause: string | null;
  status: string;
  assignedTo: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mttrExcluded?: boolean;
  attachments: Array<{
    id: string;
    fileUrl: string;
    fileType: string;
    fileName: string | null;
    fileSize: number | null;
  }>;
}

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

export default function IncidentDetailMcpHub({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [rootCauses, setRootCauses] = useState<string[]>(['Human', 'System', 'Data']);
  const [newRootCause, setNewRootCause] = useState('');
  const [addingRootCause, setAddingRootCause] = useState(false);
  const [loading, setLoading] = useState(true);

  // Resolution editor state
  const [resolutionText, setResolutionText] = useState('');

  // Edit Incident Details state
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  // Edit createdAt / closedAt timestamp state
  const [editingTimeField, setEditingTimeField] = useState<'createdAt' | 'closedAt' | null>(null);
  const [editTimeValue, setEditTimeValue] = useState('');
  const [savingTime, setSavingTime] = useState(false);

  // Attachment preview modal (holds the clicked attachment)
  const [previewAtt, setPreviewAtt] = useState<IncidentDetail['attachments'][number] | null>(null);

  // Status message / toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mcpExpanded, setMcpExpanded] = useState(false);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (!incident || ['RESOLVED', 'CLOSED', 'ON_HOLD'].includes(incident.status)) return;
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [incident?.status]);

  const fetchIncident = async () => {
    try {
      const res = await fetch(`/api/incidents/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setIncident(data);
        if (data.resolution) {
          setResolutionText(data.resolution);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data || []);
      }
    } catch (e) {}
  };

  const fetchRootCauses = async () => {
    try {
      const res = await fetch('/api/root-causes', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) setRootCauses(data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchIncident();
    fetchCategories();
    fetchRootCauses();
  }, [id]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Update Category
  const handleSelectCategory = async (catName: string) => {
    if (!incident) return;
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: catName }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIncident(updated);
        showToast(`Category updated to ${catName}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectRootCause = async (rcName: string) => {
    if (!incident) return;
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootCause: rcName }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIncident(updated);
        showToast(`Root Cause updated to ${rcName}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddRootCause = async () => {
    const clean = newRootCause.trim();
    if (!clean) return;
    setAddingRootCause(true);
    try {
      const res = await fetch('/api/root-causes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data)) {
        setRootCauses(data);
        setNewRootCause('');
        await handleSelectRootCause(clean);
      } else {
        showToast(data.error || 'ไม่สามารถเพิ่ม Root Cause ได้');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAddingRootCause(false);
    }
  };

  const validateReadyToClose = (inc: IncidentDetail) => {
    const missing: string[] = [];
    if (!inc.category?.trim()) missing.push('Category');
    if (!inc.rootCause?.trim()) missing.push('Root Cause');
    if (missing.length > 0) {
      showToast(`⚠️ กรุณาเลือก ${missing.join(' และ ')} ก่อนปิดเคส`);
      return false;
    }
    return true;
  };

  // Assign / Claim Ticket
  const handleAssignToMe = async () => {
    if (!incident) return;
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignedTo: 'Admin (Me)',
          status: 'IN_PROGRESS',
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIncident(updated);
        setEditingTimeField(null);
        showToast('Claimed ticket • Status set to IN_PROGRESS');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Update Status
  const handleUpdateStatus = async (newStatus: string) => {
    if (!incident) return;
    if (['RESOLVED', 'CLOSED'].includes(newStatus) && !validateReadyToClose(incident)) return;
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIncident(updated);
        setEditingTimeField(null);
        showToast(`Status updated to ${newStatus}`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถอัปเดตสถานะได้');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Sanitize Text
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

  // Save edited incident title and description
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
        setIncident(updated);
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

  // Close Incident & Save Resolution (Clean text available via MCP)
  const handleCloseAndIndex = async () => {
    if (!incident) return;
    if (!validateReadyToClose(incident)) return;
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'RESOLVED',
          resolution: resolutionText,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIncident(updated);
        showToast(`Incident ${incident.ticketNo} marked as RESOLVED (Clean text saved)`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถปิดเคสได้');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toLocalDateTimeInput = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleSaveTimestamp = async () => {
    if (!incident || !editingTimeField || !editTimeValue) return;
    const parsed = new Date(editTimeValue);
    if (Number.isNaN(parsed.getTime())) {
      showToast('รูปแบบวันเวลาไม่ถูกต้อง');
      return;
    }
    if (editingTimeField === 'closedAt' && parsed.getTime() < new Date(incident.createdAt).getTime()) {
      showToast('วันเวลาปิดเคสต้องไม่ก่อนเวลาเปิดเคส');
      return;
    }
    if (
      editingTimeField === 'createdAt' &&
      incident.closedAt &&
      parsed.getTime() > new Date(incident.closedAt).getTime()
    ) {
      showToast('วันเวลาเปิดเคสต้องไม่หลังเวลาปิดเคส');
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
        setIncident(updated);
        const label = editingTimeField === 'createdAt' ? 'เปิดเคส' : 'ปิดเคส';
        setEditingTimeField(null);
        showToast(`อัปเดตวันเวลา${label}เรียบร้อยแล้ว`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถอัปเดตวันเวลาได้');
      }
    } catch (e) {
      console.error(e);
      showToast('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSavingTime(false);
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
        setIncident(updated);
        showToast(nextVal ? 'ตั้งค่าไม่นำเคสนี้ไปคำนวณ MTTR แล้ว' : 'นำเคสนี้กลับเข้าคำนวณ MTTR แล้ว');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Copy JSON Payload for External MCP Client
  const buildMcpPayload = (inc: IncidentDetail) => ({
    mcp_resource_uri: `mcp://incidenthub/incidents/${inc.ticketNo}`,
    ticketNo: inc.ticketNo,
    category: inc.category || 'General',
    urgency: inc.urgency,
    status: inc.status,
    clean_text_corpus: resolutionText,
  });

  const handleCopyJson = async () => {
    if (!incident) return;
    const text = JSON.stringify(buildMcpPayload(incident), null, 2);
    let ok = false;
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {}
    if (!ok) {
      // navigator.clipboard is unavailable over plain HTTP / LAN IPs
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {}
      document.body.removeChild(ta);
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Copied MCP Schema JSON payload');
    } else {
      showToast('คัดลอกไม่สำเร็จ กรุณาคัดลอกจากตัวอย่าง JSON ด้วยตนเอง');
    }
  };

  const formatSize = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const attName = (att: IncidentDetail['attachments'][number]) =>
    att.fileName || att.fileUrl.split('/').pop() || att.fileUrl;

  const formatDuration = (startStr: string, endStr?: string | null) => {
    const start = new Date(startStr).getTime();
    const end = endStr ? new Date(endStr).getTime() : now;
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
  };

  if (loading) {
    return (
      <div className="w-full h-96 flex items-center justify-center text-slate-500 font-mono text-xs">
        <span className="material-symbols-outlined animate-spin text-sky-600 mr-2">sync</span>
        Loading Incident Telemetry...
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="w-full max-w-4xl mx-auto py-16 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Incident Not Found</h2>
        <p className="text-slate-500 text-sm">Ticket ID &quot;{id}&quot; does not exist in SQLite database.</p>
        <Link href="/admin" className="px-4 py-2 bg-sky-600 text-white rounded-lg text-xs font-semibold inline-block">
          Return to Matrix Dashboard
        </Link>
      </div>
    );
  }

  const isHigh = incident.urgency === 'HIGH';
  const isOnHold = incident.status === 'ON_HOLD';
  const isClosed = incident.status === 'RESOLVED' || incident.status === 'CLOSED';
  const charCount = resolutionText.length;
  const wordCount = resolutionText.trim() ? resolutionText.trim().split(/\s+/).length : 0;

  return (
    <div className="w-full bg-[#f0f7ff] min-h-[calc(100vh-4rem)]">
      <div className="relative w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Ambient Blobs */}
        <div className="absolute -top-32 left-1/4 w-96 h-96 bg-sky-200/40 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute top-1/2 right-10 w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[140px] pointer-events-none"></div>

        {/* Top Incident Header Crisp White Glass Card */}
        <section className="relative z-20 bg-white/95 backdrop-blur-xl rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.06)] border border-sky-100">
          <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl bg-gradient-to-r from-sky-400 via-blue-500 to-sky-300"></div>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {isHigh ? (
                  <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-semibold flex items-center gap-1.5 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span>
                    HIGH URGENCY
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold flex items-center gap-1.5">
                    {incident.urgency} URGENCY
                  </span>
                )}

                <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">sync</span>
                  {incident.status}
                </span>

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
                    <span>แก้ไขสำเร็จใน {formatDuration(incident.createdAt, incident.closedAt)}</span>
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
                    <span>เปิดมาแล้ว {formatDuration(incident.createdAt)}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-headline font-bold text-slate-900 tracking-tight leading-snug break-words">
                  <span className="text-sky-600 font-mono select-all">[{incident.ticketNo}]</span> {incident.title}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-sky-600">account_circle</span>
                  <span className="text-slate-900 font-semibold">{incident.reporterName}</span>
                  <span className="text-slate-500">
                    ({incident.department || 'General'}, {incident.contactInfo})
                  </span>
                </div>
                <span className="hidden sm:inline text-slate-300">•</span>
                <div className="flex items-center gap-1.5 text-sky-700 font-medium">
                  <span className="material-symbols-outlined text-[16px]">api</span>
                  <span>MCP Context Endpoint Ready</span>
                </div>
              </div>
            </div>

            {/* Action Toolbar */}
            <div className="flex flex-wrap lg:flex-nowrap items-center gap-2.5 shrink-0 self-start lg:self-center">
              {incident.status === 'OPEN' ? (
                <button
                  onClick={handleAssignToMe}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-sm shadow-sky-600/20"
                  title="กดรับเคสนี้ และเปลี่ยนสถานะเป็น IN_PROGRESS ทันที"
                >
                  <span className="material-symbols-outlined text-[16px]">pan_tool</span>
                  <span>Claim Ticket (รับเคส)</span>
                </button>
              ) : (
                <button
                  onClick={handleAssignToMe}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-2 transition-all shadow-xs"
                  title="คลิกเพื่อ Re-assign เคสนี้ให้ตนเอง"
                >
                  <span className="material-symbols-outlined text-[16px] text-sky-600">assignment_ind</span>
                  <span>{incident.assignedTo ? `Assigned: ${incident.assignedTo}` : 'Assign to Me'}</span>
                </button>
              )}

              <div className="relative group">
                <button className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs">
                  <span className="material-symbols-outlined text-[16px] text-sky-600">swap_horiz</span>
                  <span>Status: {incident.status}</span>
                  <span className="material-symbols-outlined text-[16px] text-slate-400">expand_more</span>
                </button>
                <div className="absolute right-0 top-full pt-1 hidden group-hover:block z-30 min-w-[150px]">
                  <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 flex flex-col gap-1">
                    {['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED'].map((st) => (
                      <button
                        key={st}
                        onClick={() => handleUpdateStatus(st)}
                        className={`px-2.5 py-1.5 text-xs text-left rounded-lg font-medium transition-colors ${
                          incident.status === st
                            ? 'bg-sky-50 text-sky-700 font-semibold'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

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

        {/* Main Content Grid (60/40 Split) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (60% -> col-span-7) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Incident Details & User Submission Card */}
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
                  <span className="px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-[11px] font-mono font-medium text-slate-600">
                    RAW-{incident.ticketNo}
                  </span>
                </div>
              </div>

              {isEditingDetails ? (
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

            {/* AI-Ready Resolution Editor (Clean Text for MCP) */}
            <div className="relative bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.08)] border-2 border-sky-200 space-y-4 overflow-hidden">
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-sky-100/50 rounded-full blur-2xl pointer-events-none"></div>
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
                  <span>Clean Text Mode: Active</span>
                </div>
              </div>

              {/* Action Helper Tags */}
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

              {/* Textarea */}
              <div className="relative">
                <textarea
                  rows={6}
                  value={resolutionText}
                  onChange={(e) => setResolutionText(e.target.value)}
                  placeholder="Enter root cause, mitigation, and preventive actions in clean text format..."
                  className="w-full bg-slate-50 text-slate-900 border border-slate-200 text-xs font-mono rounded-xl p-4 leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white resize-y transition-all"
                />
                <div className="absolute bottom-3 right-3 text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-xs">
                  <span>{charCount}</span> characters • {wordCount} words
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <div className="text-[11px] text-slate-600 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-sky-600">database</span>
                  <span>Sanitized plain text stored for Model Context Protocol access</span>
                </div>
                <button
                  onClick={handleCloseAndIndex}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(2,132,199,0.35)] hover:shadow-[0_6px_22px_rgba(2,132,199,0.45)] transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  <span>Save Resolution &amp; Mark Resolved</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column (40% -> col-span-5) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Incident Lifecycle & Duration Tracking Card */}
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
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {isClosed ? 'RESOLVED' : isOnHold ? 'ON HOLD' : 'ACTIVE'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                      เปิดเคสเมื่อ (Created)
                    </span>
                    {editingTimeField !== 'createdAt' && (
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
                    {isClosed && editingTimeField !== 'closedAt' && (
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
                  {formatDuration(incident.createdAt, incident.closedAt)}
                </div>
              </div>

              {(isOnHold || isClosed || incident.mttrExcluded) && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px]">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-violet-600">
                      {incident.mttrExcluded ? 'timer_off' : 'timer'}
                    </span>
                    {incident.mttrExcluded
                      ? 'ไม่นำไปคำนวณค่าเฉลี่ย MTTR (เคย On Hold)'
                      : 'นับรวมในค่าเฉลี่ย MTTR'}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleMttrExcluded}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold cursor-pointer shrink-0"
                  >
                    {incident.mttrExcluded ? 'นับเข้า MTTR' : 'ยกเว้น MTTR'}
                  </button>
                </div>
              )}
            </div>
            {/* Dynamic Category & Triage Routing Selector */}
            <div
              className={`bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.05)] border space-y-3.5 ${
                !incident.category?.trim() ? 'border-amber-300' : 'border-sky-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-headline font-bold text-slate-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-sky-600">alt_route</span>
                  Category &amp; Routing
                </label>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    incident.category?.trim()
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {incident.category?.trim() ? 'Selected' : '* จำเป็นก่อนปิดเคส'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {categories.map((cat) => {
                  const isSelected = incident.category === cat.name;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleSelectCategory(cat.name)}
                      className={`py-2 px-2.5 rounded-xl flex items-center gap-2 transition-all text-xs font-semibold cursor-pointer ${
                        isSelected
                          ? 'bg-sky-600 text-white shadow-[0_4px_12px_rgba(2,132,199,0.3)] border border-sky-600'
                          : 'bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-200 text-slate-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {cat.slug.includes('sap')
                          ? 'database'
                          : cat.slug.includes('net')
                          ? 'lan'
                          : cat.slug.includes('interface')
                          ? 'hub'
                          : 'support_agent'}
                      </span>
                      <span className="truncate">{cat.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200/80 text-[11px] text-slate-600 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-sky-600">verified_user</span>
                  Queue: <strong className="text-slate-900">{incident.category || 'ยังไม่ได้เลือก'}</strong>
                </span>
              </div>
            </div>

            {/* Root Cause Analysis (RCA Category) Selector */}
            <div
              className={`bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.05)] border space-y-3.5 ${
                !incident.rootCause?.trim() ? 'border-amber-300' : 'border-sky-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-headline font-bold text-slate-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-indigo-600">troubleshoot</span>
                  Root Cause Analysis
                </label>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    incident.rootCause?.trim()
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {incident.rootCause?.trim() ? 'Selected' : '* จำเป็นก่อนปิดเคส'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {rootCauses.map((rc) => {
                  const isSelected = incident.rootCause === rc;
                  return (
                    <button
                      key={rc}
                      type="button"
                      onClick={() => handleSelectRootCause(rc)}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/25'
                          : 'bg-slate-50 hover:bg-indigo-50 text-slate-700 border-slate-200 hover:border-indigo-200'
                      }`}
                    >
                      {rc}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newRootCause}
                  onChange={(e) => setNewRootCause(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddRootCause();
                    }
                  }}
                  placeholder="เพิ่ม Root Cause ใหม่ (เช่น Vendor, Network)..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-400"
                />
                <button
                  type="button"
                  disabled={addingRootCause || !newRootCause.trim()}
                  onClick={handleAddRootCause}
                  className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold cursor-pointer disabled:opacity-50 shrink-0"
                >
                  + เพิ่ม
                </button>
              </div>
            </div>

            {/* Attached Diagnostics & System Error Snapshot */}
            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.05)] border border-sky-100 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
                    <span className="material-symbols-outlined text-[18px]">attachment</span>
                  </span>
                  <div>
                    <h3 className="text-xs font-headline font-bold text-slate-900">
                      Diagnostics &amp; Evidence
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {incident.attachments.length} attachment file(s)
                    </p>
                  </div>
                </div>
              </div>

              {incident.attachments.length > 0 ? (
                incident.attachments.map((att) => {
                  const isImage = att.fileType.startsWith('image/');
                  return (
                    <div
                      key={att.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-sky-50/60 border border-sky-200/80 hover:bg-sky-50 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shrink-0">
                          <span className="material-symbols-outlined text-[22px]">{isImage ? 'image' : 'description'}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 font-mono truncate">{attName(att)}</div>
                          <div className="text-[11px] text-slate-500">
                            {att.fileType}
                            {att.fileSize != null && ` • ${formatSize(att.fileSize)}`}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setPreviewAtt(att)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-sky-600 hover:text-white hover:border-sky-600 text-xs text-slate-700 font-medium flex items-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">visibility</span>
                        <span>Preview</span>
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                  ไม่มีไฟล์แนบ
                </div>
              )}
            </div>
            {/* MCP Schema & External Endpoint Payload (Accordion) */}
            <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(2,132,199,0.05)] border border-sky-100 overflow-hidden transition-all">
              {/* Accordion Header */}
              <div
                onClick={() => setMcpExpanded(!mcpExpanded)}
                className="p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 transition-colors select-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 shrink-0">
                    <span className="material-symbols-outlined text-[18px]">api</span>
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-headline font-bold text-slate-900">
                        MCP Endpoint Schema &amp; Export
                      </h3>
                      <span className="px-1.5 py-0.5 rounded bg-sky-50 text-[10px] font-mono font-medium text-sky-700 border border-sky-200/80">
                        mcp.incident.v1
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">
                      Standardized payload for external LLM / MCP tools
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyJson();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-[11px] text-sky-700 font-mono font-medium flex items-center gap-1 transition-colors shadow-xs"
                    title="Copy incident MCP payload JSON"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {copied ? 'check' : 'content_copy'}
                    </span>
                    <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                  </button>

                  <a
                    href={`/api/mcp/v1/context?ticketNo=${incident.ticketNo}`}
                    target="_blank"
                    onClick={(e) => e.stopPropagation()}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-sky-50 border border-slate-200 text-[11px] text-slate-700 hover:text-sky-700 font-mono transition-colors shadow-xs"
                    title="Open API endpoint directly"
                  >
                    API Link
                  </a>

                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-transform">
                    <span
                      className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${
                        mcpExpanded ? 'rotate-180' : ''
                      }`}
                    >
                      expand_more
                    </span>
                  </div>
                </div>
              </div>

              {/* Accordion Collapsible Body */}
              {mcpExpanded && (
                <div className="px-5 pb-5 pt-1 space-y-4 border-t border-slate-100 bg-slate-50/40">
                  {/* Status metrics */}
                  <div className="grid grid-cols-3 gap-2 text-center pt-2">
                    <div className="bg-white border border-slate-200 p-2.5 rounded-xl shadow-xs">
                      <div className="text-[10px] text-slate-500 uppercase font-medium">Schema</div>
                      <div className="text-xs font-bold text-sky-700 font-mono mt-0.5">mcp.incident.v1</div>
                    </div>
                    <div className="bg-white border border-slate-200 p-2.5 rounded-xl shadow-xs">
                      <div className="text-[10px] text-slate-500 uppercase font-medium">Protocol</div>
                      <div className="text-xs font-bold text-slate-700 font-mono mt-0.5">REST / JSON</div>
                    </div>
                    <div className="bg-white border border-slate-200 p-2.5 rounded-xl shadow-xs">
                      <div className="text-[10px] text-slate-500 uppercase font-medium">Text Corpus</div>
                      <div className="text-xs font-bold text-emerald-700 font-mono mt-0.5">{charCount} chars</div>
                    </div>
                  </div>

                  {/* Code Payload Preview */}
                  <div className="relative bg-slate-900 rounded-xl p-3.5 font-mono text-[11px] leading-relaxed text-slate-200 shadow-inner overflow-x-auto border border-slate-800">
                    <pre className="text-slate-200 selection:bg-sky-700">
                      {JSON.stringify(
                        {
                          ...buildMcpPayload(incident),
                          clean_text_corpus:
                            resolutionText.length > 180 ? resolutionText.slice(0, 180) + '...' : resolutionText,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span className="flex items-center gap-1.5 font-mono">
                      <span className="material-symbols-outlined text-[14px] text-sky-600">sensors</span>
                      <code>/api/mcp/v1/context?ticketNo={incident.ticketNo}</code>
                    </span>
                    <span className="text-sky-700 font-mono text-[10px] font-semibold">External Client Ready</span>
                  </div>

                  {/* Architecture Separation Notice */}
                  <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200/80 flex items-start gap-2.5 text-slate-600 text-[11px] leading-relaxed">
                    <span className="material-symbols-outlined text-sky-600 text-[17px] shrink-0 mt-0.5">info</span>
                    <div>
                      <strong className="text-slate-900 font-semibold">Decoupled MCP Architecture: </strong>
                      AI insights run externally via MCP clients querying the API or database directly. The web portal maintains zero heavy AI runtime overhead.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Attachment Preview Dialog */}
      {previewAtt && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-sky-200 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-sky-600">attachment</span>
                <span className="text-sm font-bold text-slate-900 font-mono truncate">{attName(previewAtt)}</span>
              </div>
              <button
                onClick={() => setPreviewAtt(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors shrink-0"
                aria-label="Close preview"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {previewAtt.fileType.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewAtt.fileUrl}
                alt={attName(previewAtt)}
                className="max-h-[70vh] w-full object-contain rounded-xl border border-slate-200 bg-slate-50"
              />
            ) : (
              <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-600">
                ไม่สามารถแสดงตัวอย่างไฟล์ประเภท {previewAtt.fileType} ได้
              </div>
            )}

            <div className="flex items-center justify-between text-xs pt-2">
              <a
                href={previewAtt.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                Open / Download
              </a>
              <button
                onClick={() => setPreviewAtt(null)}
                className="px-4 py-2 rounded-xl bg-sky-600 text-white font-semibold text-xs hover:bg-sky-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Notification Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 transform translate-y-0 opacity-100 transition-all duration-300">
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-white text-slate-900 shadow-2xl border border-sky-200">
            <span className="material-symbols-outlined text-emerald-600 text-[22px]">check_circle</span>
            <span className="text-xs font-headline font-semibold text-slate-900">{toastMsg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
