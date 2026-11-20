'use client';

import { useState, useEffect, useRef, use } from 'react';
import Link from 'next/link';
import DepartmentInput from '@/components/DepartmentInput';
import { useRouter } from 'next/navigation';

interface RelatedIncidentSummary {
  id: string;
  ticketNo: string;
  title: string;
  status: string;
  category: string | null;
  rootCause: string | null;
  resolution: string | null;
  resolutionType: string | null;
  workaroundNote: string | null;
  createdAt: string;
  closedAt: string | null;
}

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
  resolutionType?: string | null;
  workaroundNote?: string | null;
  resolvedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mttrExcluded?: boolean;
  relatedTickets?: string | null;
  relatedTicketNos?: string[];
  relatedIncidents?: RelatedIncidentSummary[];
  referencedBy?: RelatedIncidentSummary[];
  attachments: Array<{
    id: string;
    fileUrl: string;
    fileType: string;
    fileName: string | null;
    fileSize: number | null;
    kind?: string;
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

  // Current authenticated admin user
  const [currentUser, setCurrentUser] = useState<{
    username: string;
    name: string;
    role: 'STAFF' | 'MANAGER';
  } | null>(null);

  // Resolution editor state
  const [resolutionText, setResolutionText] = useState('');
  const [resolutionType, setResolutionType] = useState<'PERMANENT' | 'WORKAROUND'>('PERMANENT');
  const [workaroundNote, setWorkaroundNote] = useState('');

  // Edit Incident Details state
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  // Edit Reporter / Department / Contact state
  const [isEditingReporter, setIsEditingReporter] = useState(false);
  const [editReporterName, setEditReporterName] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editContactInfo, setEditContactInfo] = useState('');
  const [savingReporter, setSavingReporter] = useState(false);

  // Edit createdAt / closedAt timestamp state
  const [editingTimeField, setEditingTimeField] = useState<'createdAt' | 'closedAt' | null>(null);
  const [editTimeValue, setEditTimeValue] = useState('');
  const [savingTime, setSavingTime] = useState(false);

  // Attachment preview, upload & delete state
  const [previewAtt, setPreviewAtt] = useState<IncidentDetail['attachments'][number] | null>(null);
  const [uploadingKind, setUploadingKind] = useState<'REPORT' | 'RESOLUTION' | null>(null);
  const [deletingAttId, setDeletingAttId] = useState<string | null>(null);
  const reportFileRef = useRef<HTMLInputElement>(null);
  const resolutionFileRef = useRef<HTMLInputElement>(null);

  // Related incidents search & update state
  const [relatedQuery, setRelatedQuery] = useState('');
  const [relatedSearchResults, setRelatedSearchResults] = useState<
    Array<{ id: string; ticketNo: string; title: string; status: string; resolutionType?: string | null; category?: string | null }>
  >([]);
  const [searchingRelated, setSearchingRelated] = useState(false);
  const [savingRelated, setSavingRelated] = useState(false);

  // Status message / toast & resolution submission feedback
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savingResolution, setSavingResolution] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const isMutatingStatus = updatingStatus || savingResolution;
  const normStatus = (status?: string | null) => (status || '').trim().toUpperCase();
  const [resolutionFeedback, setResolutionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [mcpExpanded, setMcpExpanded] = useState(false);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (!incident || ['RESOLVED', 'CLOSED', 'ON_HOLD'].includes(normStatus(incident.status))) return;
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [incident?.status]);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch('/api/auth/admin', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data?.user ?? null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchIncident = async () => {
    try {
      const res = await fetch(`/api/incidents/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setIncident(data);
        setResolutionText(data.resolution || '');
        setResolutionType(data.resolutionType === 'WORKAROUND' ? 'WORKAROUND' : 'PERMANENT');
        setWorkaroundNote(data.workaroundNote || '');
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
    setRelatedQuery('');
    setRelatedSearchResults([]);
    setResolutionFeedback(null);
    setUpdatingStatus(false);
    setIsEditingDetails(false);
    setIsEditingReporter(false);
    setEditingTimeField(null);
    fetchCurrentUser();
    fetchIncident();
    fetchCategories();
    fetchRootCauses();
  }, [id]);

  useEffect(() => {
    const q = relatedQuery.trim();
    if (q.length < 2) {
      setRelatedSearchResults([]);
      setSearchingRelated(false);
      return;
    }
    const controller = new AbortController();
    setSearchingRelated(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/incidents?search=${encodeURIComponent(q)}&limit=6`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (res.ok) {
          const data = await res.json();
          if (!controller.signal.aborted) {
            setRelatedSearchResults(Array.isArray(data?.incidents) ? data.incidents : []);
          }
        } else {
          setRelatedSearchResults([]);
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error(e);
          setRelatedSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearchingRelated(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [relatedQuery]);

  const handleUpdateRelatedTickets = async (nextNos: string[], toastMsg?: string) => {
    if (!incident || savingRelated) return false;
    setSavingRelated(true);
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relatedTickets: nextNos }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIncident(updated);
        if (toastMsg) showToast(toastMsg);
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถอัปเดตเคสอ้างอิงได้', 'error');
        return false;
      }
    } catch (e) {
      console.error(e);
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
      return false;
    } finally {
      setSavingRelated(false);
    }
  };

  const showToast = (msg: string, type?: 'success' | 'error') => {
    const inferredType: 'success' | 'error' =
      type ??
      (/^(⚠️|❌|ไม่สามารถ|เกิดข้อผิดพลาด|เฉพาะ|กรุณา|Only |Cannot |Category and Root Cause)/i.test(msg)
        ? 'error'
        : 'success');
    setToast({ type: inferredType, text: msg });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), inferredType === 'error' ? 6000 : 4500);
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
        setResolutionFeedback(null);
        showToast(`Category updated to ${catName}`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถเปลี่ยน Category ได้', 'error');
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
        setResolutionFeedback(null);
        showToast(`Root Cause updated to ${rcName}`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถเปลี่ยน Root Cause ได้', 'error');
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
        showToast(data.error || 'ไม่สามารถเพิ่ม Root Cause ได้', 'error');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAddingRootCause(false);
    }
  };

  const validateReadyToClose = (inc: IncidentDetail) => {
    const missing: string[] = [];
    if (!inc.assignedTo?.trim() || normStatus(inc.status) === 'OPEN') missing.push('กด Claim Ticket (รับเคส)');
    if (!inc.category?.trim()) missing.push('Category');
    if (!inc.rootCause?.trim()) missing.push('Root Cause');
    if (missing.length > 0) {
      const msg = `กรุณา ${missing.join(' และ ')} ก่อนส่งหรือปิดเคส`;
      setResolutionFeedback({ type: 'error', text: msg });
      showToast(`⚠️ ${msg}`, 'error');
      return false;
    }
    return true;
  };

  // Assign / Claim Ticket
  const handleAssignToMe = async () => {
    if (!incident || isMutatingStatus) return;
    const assignee = currentUser?.name || 'Admin';
    const isClaiming = normStatus(incident.status) === 'OPEN';
    setUpdatingStatus(true);
    try {
      const payload: { assignedTo: string; status?: string } = isClaiming
        ? { assignedTo: assignee, status: 'IN_PROGRESS' }
        : { assignedTo: assignee };
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        setIncident(updated);
        setEditingTimeField(null);
        setResolutionFeedback(null);
        showToast(
          isClaiming
            ? 'Claimed ticket • Status set to IN_PROGRESS'
            : `Re-assigned ticket to ${assignee}`
        );
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถเปลี่ยนผู้รับผิดชอบได้', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Update Status
  const handleUpdateStatus = async (newStatus: string) => {
    if (!incident || isMutatingStatus) return;
    if (['RESOLVED', 'CLOSED'].includes(newStatus)) {
      if (currentUser?.role !== 'MANAGER') {
        showToast('เฉพาะ Manager เท่านั้น', 'error');
        return;
      }
      if (!validateReadyToClose(incident)) return;
    }
    const prevStatus = normStatus(incident.status);
    setUpdatingStatus(true);
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
        setResolutionFeedback(null);
        if (['RESOLVED', 'CLOSED'].includes(newStatus)) {
          setIsEditingDetails(false);
        }
        const successMsg =
          newStatus === 'ON_HOLD'
            ? 'พักเคสเป็น On Hold แล้ว (หยุดนับ MTTR)'
            : newStatus === 'IN_PROGRESS' && prevStatus === 'ON_HOLD'
              ? 'กลับมาดำเนินการต่อ (IN_PROGRESS)'
              : newStatus === 'IN_PROGRESS' && prevStatus === 'PENDING_CONFIRM'
                ? 'ตีกลับเคสเพื่อแก้ไขต่อ (IN_PROGRESS)'
                : newStatus === 'IN_PROGRESS' && (prevStatus === 'RESOLVED' || prevStatus === 'CLOSED')
                  ? 'เปิดเคสใหม่แล้ว (IN_PROGRESS)'
                  : `Status updated to ${newStatus}`;
        showToast(successMsg);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ไม่สามารถอัปเดตสถานะได้', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
    } finally {
      setUpdatingStatus(false);
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

  // Save edited reporter name, department, and contact info
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
        setIncident(updated);
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

  // Save resolution draft, submit for Manager confirm, or mark RESOLVED
  const submitResolutionUpdate = async (targetStatus?: 'PENDING_CONFIRM' | 'RESOLVED') => {
    if (!incident || isMutatingStatus) return;
    setResolutionFeedback(null);
    if (targetStatus) {
      if (!validateReadyToClose(incident)) return;
      if (resolutionType === 'WORKAROUND' && !workaroundNote.trim()) {
        const msg = 'กรุณาระบุเงื่อนไข Workaround ในช่องด้านบนก่อนปิดเคส';
        setResolutionFeedback({ type: 'error', text: msg });
        showToast(`⚠️ ${msg}`, 'error');
        return;
      }
    }
    const payload: Record<string, unknown> = {
      resolution: resolutionText,
      resolutionType,
      workaroundNote: resolutionType === 'WORKAROUND' ? workaroundNote.trim() : '',
    };
    if (targetStatus) payload.status = targetStatus;

    setSavingResolution(true);
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        setIncident(updated);
        if (targetStatus === 'RESOLVED') {
          setIsEditingDetails(false);
          setIsEditingReporter(false);
          setEditingTimeField(null);
          const msg = `ปิดเคส ${incident.ticketNo} เป็น RESOLVED เรียบร้อยแล้ว`;
          setResolutionFeedback({ type: 'success', text: msg });
          showToast(msg, 'success');
        } else if (targetStatus === 'PENDING_CONFIRM') {
          const msg = `ส่งเคส ${incident.ticketNo} ให้ Manager ยืนยันปิดเคสแล้ว`;
          setResolutionFeedback({ type: 'success', text: msg });
          showToast(msg, 'success');
        } else {
          const msg = 'บันทึกร่างการแก้ไขเรียบร้อยแล้ว';
          setResolutionFeedback({ type: 'success', text: msg });
          showToast(msg, 'success');
        }
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = err.error || `ไม่สามารถบันทึกข้อมูลได้ (HTTP ${res.status})`;
        setResolutionFeedback({ type: 'error', text: msg });
        showToast(msg, 'error');
      }
    } catch (e) {
      console.error(e);
      const msg = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
      setResolutionFeedback({ type: 'error', text: msg });
      showToast(msg, 'error');
    } finally {
      setSavingResolution(false);
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
        setIncident(updated);
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
      showToast('คัดลอกไม่สำเร็จ กรุณาคัดลอกจากตัวอย่าง JSON ด้วยตนเอง', 'error');
    }
  };

  const formatSize = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const attName = (att: IncidentDetail['attachments'][number]) =>
    att.fileName || att.fileUrl.split('/').pop() || att.fileUrl;

  const handleUploadAttachments = async (files: FileList | File[], kind: 'REPORT' | 'RESOLUTION') => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setUploadingKind(kind);
    let uploadedCount = 0;
    try {
      for (const file of fileList) {
        if (!file.type.startsWith('image/')) {
          alert(`ไฟล์ "${file.name}" ไม่ใช่รูปภาพ (รองรับ PNG, JPG, GIF, WebP)`);
          continue;
        }
        if (file.size > 5 * 1024 * 1024) {
          alert(`ไฟล์ "${file.name}" มีขนาดเกิน 5MB`);
          continue;
        }
        const formData = new FormData();
        formData.append('file', file, file.name || `screenshot_${Date.now()}.png`);
        formData.append('kind', kind);
        const res = await fetch(`/api/incidents/${encodeURIComponent(id)}/attachments`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || 'อัปโหลดรูปภาพไม่สำเร็จ');
          continue;
        }
        const created = await res.json();
        setIncident((prev) => (prev ? { ...prev, attachments: [...prev.attachments, created] } : prev));
        uploadedCount += 1;
      }
      if (uploadedCount > 0) {
        showToast(
          kind === 'RESOLUTION'
            ? `เพิ่มรูปหลักฐานปิดงาน ${uploadedCount} รูปเรียบร้อย`
            : `แนบรูปอาการเพิ่มเติม ${uploadedCount} รูปเรียบร้อย`
        );
      }
    } finally {
      setUploadingKind(null);
    }
  };

  const handlePasteImages = (e: React.ClipboardEvent, kind: 'REPORT' | 'RESOLUTION') => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const images: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile();
        if (f) images.push(f);
      }
    }
    if (images.length > 0) {
      e.preventDefault();
      handleUploadAttachments(images, kind);
    }
  };

  const handleDeleteAttachment = async (att: IncidentDetail['attachments'][number]) => {
    if (!confirm(`ต้องการลบรูปแนบ "${attName(att)}" ใช่ไหม?`)) return;
    setDeletingAttId(att.id);
    try {
      const res = await fetch(
        `/api/incidents/${encodeURIComponent(id)}/attachments?attachmentId=${encodeURIComponent(att.id)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'ลบรูปแนบไม่สำเร็จ');
        return;
      }
      setIncident((prev) =>
        prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== att.id) } : prev
      );
      if (previewAtt?.id === att.id) setPreviewAtt(null);
      showToast('ลบรูปแนบเรียบร้อย');
    } finally {
      setDeletingAttId(null);
    }
  };

  const renderAttachmentRow = (att: IncidentDetail['attachments'][number], tone: 'sky' | 'emerald') => {
    const isImage = att.fileType.startsWith('image/');
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
        key={att.id}
        className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-all ${boxStyle}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${iconStyle}`}>
            <span className="material-symbols-outlined text-[20px]">{isImage ? 'image' : 'description'}</span>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-800 font-mono truncate">{attName(att)}</div>
            <div className="text-[11px] text-slate-500">
              {att.fileType}
              {att.fileSize != null && ` • ${formatSize(att.fileSize)}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setPreviewAtt(att)}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-sky-600 hover:text-white hover:border-sky-600 text-xs text-slate-700 font-medium flex items-center gap-1 transition-all shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">visibility</span>
            <span>Preview</span>
          </button>
          {!(incident && ['RESOLVED', 'CLOSED'].includes(normStatus(incident.status))) && (
            <button
              type="button"
              disabled={deletingAttId === att.id}
              onClick={() => handleDeleteAttachment(att)}
              title="ลบรูปแนบ"
              className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-slate-400 transition-all cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[15px]">delete</span>
            </button>
          )}
        </div>
      </div>
    );
  };

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
  const statusKey = normStatus(incident.status);
  const isOnHold = statusKey === 'ON_HOLD';
  const isPendingConfirm = statusKey === 'PENDING_CONFIRM';
  const isClosed = statusKey === 'RESOLVED' || statusKey === 'CLOSED';
  const isManager = currentUser?.role === 'MANAGER';
  const charCount = resolutionText.length;
  const wordCount = resolutionText.trim() ? resolutionText.trim().split(/\s+/).length : 0;
  const reportAttachments = incident.attachments.filter((a) => (a.kind || 'REPORT') !== 'RESOLUTION');
  const resolutionAttachments = incident.attachments.filter((a) => a.kind === 'RESOLUTION');

  const isClaimed = Boolean(incident.assignedTo?.trim()) && statusKey !== 'OPEN';
  const missingToClose: string[] = [];
  if (!isClaimed) missingToClose.push('รับเคส (Claim Ticket)');
  if (!incident.category?.trim()) missingToClose.push('Category');
  if (!incident.rootCause?.trim()) missingToClose.push('Root Cause');
  if (resolutionType === 'WORKAROUND' && !workaroundNote.trim()) missingToClose.push('เงื่อนไข Workaround');

  const relatedIncidents = incident.relatedIncidents || [];
  const referencedBy = incident.referencedBy || [];
  const currentRelatedNos = relatedIncidents.map((r) => r.ticketNo);
  const canEditRelated = !isClosed;
  const filteredRelatedResults = relatedSearchResults.filter(
    (item) => item.ticketNo !== incident.ticketNo && !currentRelatedNos.includes(item.ticketNo)
  );
  const statusPillClass = (status: string) => {
    const s = normStatus(status);
    return s === 'RESOLVED' || s === 'CLOSED'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : s === 'ON_HOLD'
      ? 'bg-violet-50 text-violet-700 border-violet-200'
      : s === 'PENDING_CONFIRM'
      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
      : 'bg-sky-50 text-sky-700 border-sky-200';
  };

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

              {isEditingReporter && !isClosed ? (
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
                  {!isClosed && (
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
            </div>

            {/* Action Toolbar */}
            <div className="flex flex-wrap lg:flex-nowrap items-center gap-2.5 shrink-0 self-start lg:self-center">
              {statusKey === 'OPEN' ? (
                <button
                  type="button"
                  onClick={handleAssignToMe}
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
                  onClick={handleAssignToMe}
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
                  onClick={() => handleUpdateStatus('ON_HOLD')}
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
                  onClick={() => handleUpdateStatus('IN_PROGRESS')}
                  className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shadow-sky-600/20 cursor-pointer"
                  title="กลับมาดำเนินการต่อ (IN_PROGRESS)"
                >
                  <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                  <span>กลับมาทำต่อ (Resume)</span>
                </button>
              )}

              {isClosed && isManager && (
                <button
                  type="button"
                  disabled={isMutatingStatus}
                  onClick={() => {
                    if (window.confirm('ต้องการเปิดเคสนี้กลับเป็น IN_PROGRESS เพื่อแก้ไขเพิ่มเติมใช่ไหม?')) {
                      handleUpdateStatus('IN_PROGRESS');
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
                  {isClosed ? (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                      🔒 Locked หลังปิดเคส
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

              {isEditingDetails && !isClosed ? (
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
            <div
              onPaste={(e) => {
                if (!isClosed) handlePasteImages(e, 'RESOLUTION');
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                if (!isClosed && e.dataTransfer.files?.length) {
                  e.preventDefault();
                  handleUploadAttachments(e.dataTransfer.files, 'RESOLUTION');
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
                      รูปหลักฐานการแก้ไข / ปิดงาน ({resolutionAttachments.length})
                    </span>
                    {!isClosed && (
                      <span className="text-[11px] text-slate-500 hidden sm:inline">
                        วางรูป (Ctrl+V) หรือลากวางได้
                      </span>
                    )}
                  </div>
                  {!isClosed && (
                    <>
                      <input
                        ref={resolutionFileRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.length) handleUploadAttachments(e.target.files, 'RESOLUTION');
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
                        <span>{uploadingKind === 'RESOLUTION' ? 'กำลังอัปโหลด...' : '+ เพิ่มรูปปิดงาน'}</span>
                      </button>
                    </>
                  )}
                </div>

                {resolutionAttachments.length > 0 && (
                  <div className="space-y-2">
                    {resolutionAttachments.map((att) => renderAttachmentRow(att, 'emerald'))}
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
                          onClick={() => handleUpdateStatus('IN_PROGRESS')}
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
                        onClick={() => submitResolutionUpdate('RESOLVED')}
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
                        onClick={() => submitResolutionUpdate()}
                        className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="material-symbols-outlined text-[16px]">save</span>
                        <span>{savingResolution ? 'กำลังบันทึก...' : 'Save Draft'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={!isClaimed || isPendingConfirm || isClosed || isMutatingStatus}
                        onClick={() => submitResolutionUpdate('PENDING_CONFIRM')}
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
                      type="button"
                      disabled={isClosed}
                      onClick={() => handleSelectCategory(cat.name)}
                      className={`py-2 px-2.5 rounded-xl flex items-center gap-2 transition-all text-xs font-semibold cursor-pointer disabled:cursor-not-allowed ${
                        isSelected
                          ? 'bg-sky-600 text-white shadow-[0_4px_12px_rgba(2,132,199,0.3)] border border-sky-600'
                          : 'bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-200 text-slate-700 disabled:opacity-50'
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
                      disabled={isClosed}
                      onClick={() => handleSelectRootCause(rc)}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:cursor-not-allowed border ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/25'
                          : 'bg-slate-50 hover:bg-indigo-50 text-slate-700 border-slate-200 hover:border-indigo-200 disabled:opacity-50'
                      }`}
                    >
                      {rc}
                    </button>
                  );
                })}
              </div>

              {!isClosed && (
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
              )}
            </div>

            {/* Attached Diagnostics & System Error Snapshot (REPORT) */}
            <div
              tabIndex={0}
              onPaste={(e) => {
                if (!isClosed) handlePasteImages(e, 'REPORT');
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                if (!isClosed && e.dataTransfer.files?.length) {
                  e.preventDefault();
                  handleUploadAttachments(e.dataTransfer.files, 'REPORT');
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
                      {reportAttachments.length} attachment file(s)
                      {!isClosed ? ' • คลิกหรือวางรูป (Ctrl+V)' : ''}
                    </p>
                  </div>
                </div>
                {!isClosed && (
                  <>
                    <input
                      ref={reportFileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.length) handleUploadAttachments(e.target.files, 'REPORT');
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
                        {uploadingKind === 'REPORT' ? 'sync' : 'add_photo_alternate'}
                      </span>
                      <span>{uploadingKind === 'REPORT' ? 'กำลังอัปโหลด...' : '+ แนบรูป'}</span>
                    </button>
                  </>
                )}
              </div>

              {reportAttachments.length > 0 ? (
                reportAttachments.map((att) => renderAttachmentRow(att, 'sky'))
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500 text-center">
                  {isClosed ? 'ไม่มีไฟล์แนบจากผู้แจ้ง' : 'ไม่มีไฟล์แนบจากผู้แจ้ง — กด "+ แนบรูป" หรือวางรูปเพิ่มภายหลังได้'}
                </div>
              )}
            </div>

            {/* Related Incidents (อ้างอิงเคสเก่า) */}
            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.05)] border border-sky-100 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shrink-0">
                    <span className="material-symbols-outlined text-[18px]">link</span>
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-xs font-headline font-bold text-slate-900">
                      Related Incidents (อ้างอิงเคสเก่า)
                    </h3>
                    <p className="text-[11px] text-slate-500">เชื่อมโยงเคสที่เคยเกิดขึ้นเพื่ออ้างอิงวิธีแก้ไข</p>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-semibold font-mono shrink-0">
                  {relatedIncidents.length} linked
                </span>
              </div>

              {canEditRelated && (
                <div className="relative">
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined text-[16px] text-slate-400 absolute left-3 pointer-events-none">
                      search
                    </span>
                    <input
                      type="text"
                      value={relatedQuery}
                      disabled={savingRelated}
                      onChange={(e) => setRelatedQuery(e.target.value)}
                      placeholder="ค้นหาเลข Ticket หรือหัวข้อเคสเพื่ออ้างอิง..."
                      className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 disabled:opacity-60"
                    />
                    {relatedQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setRelatedQuery('');
                          setRelatedSearchResults([]);
                        }}
                        aria-label="Clear search"
                        className="absolute right-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    )}
                  </div>

                  {relatedQuery.trim().length >= 2 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                      {searchingRelated ? (
                        <div className="px-3 py-2.5 text-xs text-slate-500 flex items-center gap-2">
                          <span className="material-symbols-outlined text-[15px] animate-spin text-sky-600">sync</span>
                          <span>กำลังค้นหาเคส...</span>
                        </div>
                      ) : filteredRelatedResults.length === 0 ? (
                        <div className="px-3 py-2.5 text-xs text-slate-500">ไม่พบเคสที่ตรงกัน</div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {filteredRelatedResults.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              disabled={savingRelated}
                              onClick={async () => {
                                const ok = await handleUpdateRelatedTickets(
                                  [...currentRelatedNos, item.ticketNo],
                                  `เชื่อมโยงเคส ${item.ticketNo} แล้ว`
                                );
                                if (ok) {
                                  setRelatedQuery('');
                                  setRelatedSearchResults([]);
                                }
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-sky-50/80 transition-colors flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] font-mono font-bold text-sky-700 shrink-0">
                                    {item.ticketNo}
                                  </span>
                                  <span className="text-xs text-slate-800 truncate">{item.title}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {item.resolutionType === 'WORKAROUND' && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                                    Workaround
                                  </span>
                                )}
                                <span
                                  className={`px-1.5 py-0.5 rounded-md border text-[10px] font-mono font-semibold ${statusPillClass(item.status)}`}
                                >
                                  {item.status}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {relatedIncidents.length > 0 ? (
                <div className="space-y-2">
                  {relatedIncidents.map((rel) => (
                    <div
                      key={rel.ticketNo}
                      className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/80 hover:border-sky-200 transition-colors space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/admin/incidents/${rel.ticketNo}`}
                          className="min-w-0 flex-1 group"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-mono font-bold text-sky-700 group-hover:underline">
                              {rel.ticketNo}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded-md border text-[10px] font-mono font-semibold ${statusPillClass(rel.status)}`}
                            >
                              {rel.status}
                            </span>
                            {rel.resolutionType === 'WORKAROUND' && (
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                                Workaround
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-700 group-hover:text-slate-900 truncate mt-0.5">
                            {rel.title}
                          </p>
                        </Link>
                        <button
                          type="button"
                          disabled={!canEditRelated || savingRelated}
                          onClick={() =>
                            handleUpdateRelatedTickets(
                              currentRelatedNos.filter((t) => t !== rel.ticketNo),
                              `ยกเลิกการอ้างอิงเคส ${rel.ticketNo} แล้ว`
                            )
                          }
                          title={!canEditRelated ? 'ปิดเคสแล้ว (เฉพาะ Manager)' : 'ลบการอ้างอิง'}
                          aria-label={`Remove ${rel.ticketNo}`}
                          className="w-6 h-6 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-slate-400 flex items-center justify-center text-sm leading-none shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          ×
                        </button>
                      </div>

                      {rel.resolution?.trim() && !isClosed && (
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              const snippet = rel.resolution?.trim();
                              if (!snippet) return;
                              setResolutionText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${snippet}` : snippet));
                              showToast(`คัดลอกวิธีแก้จาก ${rel.ticketNo} แล้ว`);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white border border-sky-200 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[13px]">content_copy</span>
                            <span>คัดลอกวิธีแก้</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500 text-center">
                  ยังไม่มีเคสที่อ้างอิง
                </div>
              )}

              {referencedBy.length > 0 && (
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-600">
                    ถูกอ้างอิงโดยเคสใหม่ ({referencedBy.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {referencedBy.map((ref) => (
                      <Link
                        key={ref.ticketNo}
                        href={`/admin/incidents/${ref.ticketNo}`}
                        className="inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-200 text-[11px] transition-colors"
                      >
                        <span className="font-mono font-bold text-sky-700 shrink-0">{ref.ticketNo}</span>
                        <span className="text-slate-600 truncate max-w-[140px]">{ref.title}</span>
                        <span
                          className={`px-1.5 py-px rounded border text-[9px] font-mono font-semibold shrink-0 ${statusPillClass(ref.status)}`}
                        >
                          {ref.status}
                        </span>
                      </Link>
                    ))}
                  </div>
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
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                    previewAtt.kind === 'RESOLUTION'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-sky-50 text-sky-700 border border-sky-200'
                  }`}
                >
                  {previewAtt.kind === 'RESOLUTION' ? 'รูปปิดงาน' : 'รูปฝั่งผู้แจ้ง'}
                </span>
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

      {/* Prominent Top-Center Notification Banner */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-lg transition-all duration-200">
          <div
            role="status"
            className={`flex items-center justify-between gap-3 px-5 py-3.5 rounded-xl shadow-2xl border ${
              toast.type === 'error'
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-emerald-600 text-white border-emerald-500'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="material-symbols-outlined text-[22px] shrink-0">
                {toast.type === 'error' ? 'error' : 'check_circle'}
              </span>
              <span className="text-sm font-headline font-semibold leading-snug">{toast.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="opacity-80 hover:opacity-100 shrink-0 cursor-pointer"
              aria-label="Close notification"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
