'use client';

import { useState, useEffect, useRef, use, type ClipboardEvent } from 'react';
import Link from 'next/link';
import {
  ALLOWED_ATTACHMENT_LABEL,
  fallbackAttachmentFileName,
  isAllowedAttachment,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
} from '@/lib/attachments';
import { DEFAULT_ROOT_CAUSE_TREE, type RootCauseNode } from '@/components/ManageRootCausesModal';
import AttachmentPreviewModal from './_components/AttachmentPreviewModal';
import IncidentDetailsCard from './_components/IncidentDetailsCard';
import IncidentHeaderCard from './_components/IncidentHeaderCard';
import LifecycleDurationCard from './_components/LifecycleDurationCard';
import McpPreviewAccordion from './_components/McpPreviewAccordion';
import RelatedIncidentsCard from './_components/RelatedIncidentsCard';
import ReportAttachmentsCard from './_components/ReportAttachmentsCard';
import ResolutionEditorCard from './_components/ResolutionEditorCard';
import TriageSelectorsCard from './_components/TriageSelectorsCard';
import type {
  CategoryItem,
  CurrentAdminUser,
  IncidentAttachment,
  IncidentDetail,
  ResolutionFeedback,
} from './_components/types';
import { attName, normStatus } from './_components/utils';

export default function IncidentDetailMcpHub({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [rootCauseTree, setRootCauseTree] = useState<RootCauseNode[]>(DEFAULT_ROOT_CAUSE_TREE);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentAdminUser | null>(null);

  // Shared resolution state (ResolutionEditorCard, RelatedIncidentsCard, McpPreviewAccordion, header checks)
  const [resolutionText, setResolutionText] = useState('');
  const [resolutionType, setResolutionType] = useState<'PERMANENT' | 'WORKAROUND'>('PERMANENT');
  const [workaroundNote, setWorkaroundNote] = useState('');
  const [resolvedByExternal, setResolvedByExternal] = useState(false);
  const [managerComment, setManagerComment] = useState('');
  const [resolutionFeedback, setResolutionFeedback] = useState<ResolutionFeedback | null>(null);

  // Shared attachment preview, upload & delete state
  const [previewAtt, setPreviewAtt] = useState<IncidentAttachment | null>(null);
  const [uploadingKind, setUploadingKind] = useState<'REPORT' | 'RESOLUTION' | null>(null);
  const [deletingAttId, setDeletingAttId] = useState<string | null>(null);

  // Status mutations, toast & live clock
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savingResolution, setSavingResolution] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  const isMutatingStatus = updatingStatus || savingResolution;
  const isTickerActive =
    Boolean(incident) && !['RESOLVED', 'CLOSED', 'ON_HOLD'].includes(normStatus(incident?.status));

  useEffect(() => {
    if (!isTickerActive) return;
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [isTickerActive]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setResolutionFeedback(null);
    setUpdatingStatus(false);
    setPreviewAtt(null);

    const loadCurrentUser = async () => {
      try {
        const res = await fetch('/api/auth/admin', { cache: 'no-store' });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setCurrentUser(data?.user ?? null);
        }
      } catch (e) {
        console.error(e);
      }
    };

    const loadIncident = async () => {
      try {
        const res = await fetch(`/api/incidents/${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setIncident(data);
          setResolutionText(data.resolution || '');
          setResolutionType(data.resolutionType === 'WORKAROUND' ? 'WORKAROUND' : 'PERMANENT');
          setWorkaroundNote(data.workaroundNote || '');
          setResolvedByExternal(Boolean(data.resolvedByExternal));
          setManagerComment(data.managerComment || '');
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const loadCategories = async () => {
      try {
        const res = await fetch('/api/categories', { cache: 'no-store' });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setCategories(data || []);
        }
      } catch {}
    };

    const loadRootCauses = async () => {
      try {
        const res = await fetch('/api/root-causes?format=tree', { cache: 'no-store' });
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) setRootCauseTree(data);
        }
      } catch {}
    };

    loadCurrentUser();
    loadIncident();
    loadCategories();
    loadRootCauses();

    return () => {
      cancelled = true;
    };
  }, [id]);

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

  const refreshIncident = async () => {
    try {
      const res = await fetch(`/api/incidents/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setIncident(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const validateReadyToClose = (inc: IncidentDetail, overrideResolution?: string) => {
    const missing: string[] = [];
    if (!resolvedByExternal && (!inc.assignedTo?.trim() || normStatus(inc.status) === 'OPEN')) {
      missing.push('กด Claim Ticket (รับเคส)');
    }
    if (!inc.category?.trim()) missing.push('Category');
    if (!inc.rootCause?.trim()) {
      missing.push('Root Cause');
    } else if (inc.rootCause.split(' > ').map((p) => p.trim()).filter(Boolean).length !== 2) {
      missing.push('Root Cause (เลือก Branch ย่อย)');
    }
    if (!(overrideResolution ?? resolutionText ?? inc.resolution ?? '').trim()) {
      missing.push('บันทึกการแก้ไข (Resolution)');
    }
    if (missing.length > 0) {
      const msg = `กรุณา ${missing.join(' และ ')} ก่อนส่งหรือปิดเคส`;
      setResolutionFeedback({ type: 'error', text: msg });
      showToast(`⚠️ ${msg}`, 'error');
      return false;
    }
    return true;
  };

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

  const handleUpdateStatus = async (newStatus: string, extra?: Record<string, unknown>) => {
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
      const isSendBack =
        currentUser?.role === 'MANAGER' && prevStatus === 'PENDING_CONFIRM' && newStatus === 'IN_PROGRESS';
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          ...(isSendBack ? { managerComment: managerComment.trim() } : {}),
          ...extra,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIncident(updated);
        setResolvedByExternal(Boolean(updated.resolvedByExternal));
        setManagerComment(updated.managerComment || '');
        setResolutionFeedback(null);
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

  const submitResolutionUpdate = async (targetStatus?: 'PENDING_CONFIRM' | 'RESOLVED') => {
    if (!incident || isMutatingStatus) return;
    setResolutionFeedback(null);

    if (isManager) {
      if (targetStatus !== 'RESOLVED' || normStatus(incident.status) !== 'PENDING_CONFIRM') {
        showToast('Manager ยืนยันปิดเคสได้เฉพาะเคสที่ Staff ส่งมารออนุมัติ (PENDING_CONFIRM)', 'error');
        return;
      }
      await handleUpdateStatus('RESOLVED', { managerComment: managerComment.trim() });
      return;
    }

    if (targetStatus) {
      if (!validateReadyToClose(incident, resolutionText)) return;
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
      resolvedByExternal,
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
        setResolvedByExternal(Boolean(updated.resolvedByExternal));
        setManagerComment(updated.managerComment || '');
        if (targetStatus === 'RESOLVED') {
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

  const handleUploadAttachments = async (files: FileList | File[], kind: 'REPORT' | 'RESOLUTION') => {
    if (uploadingKind || (incident && ['RESOLVED', 'CLOSED'].includes(normStatus(incident.status)))) return;
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setUploadingKind(kind);
    let uploadedCount = 0;
    try {
      for (const file of fileList) {
        if (!isAllowedAttachment(file.name, file.type)) {
          showToast(`ไม่รองรับไฟล์ "${file.name}" (รองรับ: ${ALLOWED_ATTACHMENT_LABEL})`, 'error');
          continue;
        }
        if (file.size === 0) {
          showToast(`ไฟล์ "${file.name}" เป็นไฟล์ว่าง (0 bytes)`, 'error');
          continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          showToast(`ไฟล์ "${file.name}" มีขนาดเกิน ${MAX_ATTACHMENT_MB}MB`, 'error');
          continue;
        }
        const fileName = file.name || fallbackAttachmentFileName(file.type);
        const formData = new FormData();
        formData.append('file', file, fileName);
        formData.append('kind', kind);
        const res = await fetch(`/api/incidents/${encodeURIComponent(id)}/attachments`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showToast(err.error || 'อัปโหลดไฟล์แนบไม่สำเร็จ', 'error');
          continue;
        }
        const created = await res.json();
        setIncident((prev) => (prev ? { ...prev, attachments: [...prev.attachments, created] } : prev));
        uploadedCount += 1;
      }
      if (uploadedCount > 0) {
        showToast(
          kind === 'RESOLUTION'
            ? `เพิ่มไฟล์หลักฐานปิดงาน ${uploadedCount} ไฟล์เรียบร้อย`
            : `แนบไฟล์เพิ่มเติม ${uploadedCount} ไฟล์เรียบร้อย`
        );
      }
    } catch (e) {
      console.error(e);
      showToast('เกิดข้อผิดพลาดในการอัปโหลดไฟล์แนบ', 'error');
    } finally {
      setUploadingKind(null);
    }
  };

  const handlePasteImages = (e: ClipboardEvent, kind: 'REPORT' | 'RESOLUTION') => {
    if (incident && ['RESOLVED', 'CLOSED'].includes(normStatus(incident.status))) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const f = items[i].getAsFile();
        if (f && isAllowedAttachment(f.name, f.type)) pastedFiles.push(f);
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      handleUploadAttachments(pastedFiles, kind);
    }
  };

  const handleDeleteAttachment = async (att: IncidentAttachment) => {
    if (deletingAttId || (incident && ['RESOLVED', 'CLOSED'].includes(normStatus(incident.status)))) return;
    if (!confirm(`ต้องการลบไฟล์แนบ "${attName(att)}" ใช่ไหม?`)) return;
    setDeletingAttId(att.id);
    try {
      const res = await fetch(
        `/api/incidents/${encodeURIComponent(id)}/attachments?attachmentId=${encodeURIComponent(att.id)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'ลบไฟล์แนบไม่สำเร็จ', 'error');
        return;
      }
      setIncident((prev) =>
        prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== att.id) } : prev
      );
      if (previewAtt?.id === att.id) setPreviewAtt(null);
      showToast('ลบไฟล์แนบเรียบร้อย');
    } catch (e) {
      console.error(e);
      showToast('เกิดข้อผิดพลาดในการลบไฟล์แนบ', 'error');
    } finally {
      setDeletingAttId(null);
    }
  };

  const handleAppendResolution = (snippet: string, sourceTicketNo: string) => {
    setResolutionText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${snippet}` : snippet));
    showToast(`คัดลอกวิธีแก้จาก ${sourceTicketNo} แล้ว`);
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

  const statusKey = normStatus(incident.status);
  const isOnHold = statusKey === 'ON_HOLD';
  const isPendingConfirm = statusKey === 'PENDING_CONFIRM';
  const isClosed = statusKey === 'RESOLVED' || statusKey === 'CLOSED';
  const isManager = currentUser?.role === 'MANAGER';
  const categoryColor =
    categories.find(
      (c) => c.id === incident.categoryId || c.name.toLowerCase() === (incident.category || '').toLowerCase()
    )?.color ??
    incident.categoryRel?.color ??
    null;
  const reportAttachments = incident.attachments.filter((a) => (a.kind || 'REPORT') !== 'RESOLUTION');
  const resolutionAttachments = incident.attachments.filter((a) => a.kind === 'RESOLUTION');

  const isClaimed = Boolean(incident.assignedTo?.trim()) && statusKey !== 'OPEN';
  const canSubmitWithoutClaim = isClaimed || resolvedByExternal;
  const missingToClose: string[] = [];
  if (!canSubmitWithoutClaim) missingToClose.push('รับเคส (Claim Ticket)');
  if (!incident.category?.trim()) missingToClose.push('Category');
  if (!incident.rootCause?.trim()) {
    missingToClose.push('Root Cause');
  } else if (incident.rootCause.split(' > ').map((p) => p.trim()).filter(Boolean).length !== 2) {
    missingToClose.push('Root Cause (เลือก Branch ย่อย)');
  }
  if (resolutionType === 'WORKAROUND' && !workaroundNote.trim()) missingToClose.push('เงื่อนไข Workaround');
  if (!resolutionText.trim()) missingToClose.push('บันทึกการแก้ไข (Resolution)');

  return (
    <div className="w-full bg-[#f0f7ff] min-h-[calc(100vh-4rem)]">
      <div className="relative w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Ambient Blobs */}
        <div className="absolute -top-32 left-1/4 w-96 h-96 bg-sky-200/40 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute top-1/2 right-10 w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[140px] pointer-events-none"></div>

        <IncidentHeaderCard
          incident={incident}
          categoryColor={categoryColor}
          isClosed={isClosed}
          isManager={isManager}
          isMutatingStatus={isMutatingStatus}
          nowMs={now}
          onIncidentUpdated={setIncident}
          onAssignToMe={handleAssignToMe}
          onUpdateStatus={handleUpdateStatus}
          showToast={showToast}
        />

        {/* Main Content Grid (60/40 Split) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (60% -> col-span-7) */}
          <div className="lg:col-span-7 space-y-6">
            <IncidentDetailsCard
              incident={incident}
              isClosed={isClosed}
              isManager={isManager}
              onIncidentUpdated={setIncident}
              showToast={showToast}
            />

            <RelatedIncidentsCard
              incident={incident}
              isClosed={isClosed}
              isManager={isManager}
              onIncidentUpdated={setIncident}
              onAppendResolution={handleAppendResolution}
              showToast={showToast}
            />

            <ResolutionEditorCard
              incident={incident}
              isClosed={isClosed}
              isManager={isManager}
              isClaimed={isClaimed}
              isPendingConfirm={isPendingConfirm}
              isMutatingStatus={isMutatingStatus}
              savingResolution={savingResolution}
              resolutionText={resolutionText}
              setResolutionText={setResolutionText}
              resolutionType={resolutionType}
              setResolutionType={setResolutionType}
              workaroundNote={workaroundNote}
              setWorkaroundNote={setWorkaroundNote}
              resolvedByExternal={resolvedByExternal}
              setResolvedByExternal={setResolvedByExternal}
              managerComment={managerComment}
              setManagerComment={setManagerComment}
              resolutionFeedback={resolutionFeedback}
              setResolutionFeedback={setResolutionFeedback}
              missingToClose={missingToClose}
              resolutionAttachments={resolutionAttachments}
              uploadingKind={uploadingKind}
              deletingAttId={deletingAttId}
              onUploadAttachments={handleUploadAttachments}
              onPasteImages={handlePasteImages}
              onPreviewAttachment={setPreviewAtt}
              onDeleteAttachment={handleDeleteAttachment}
              onSubmitResolution={submitResolutionUpdate}
              onUpdateStatus={handleUpdateStatus}
              showToast={showToast}
            />
          </div>

          {/* Right Column (40% -> col-span-5) */}
          <div className="lg:col-span-5 space-y-6">
            <LifecycleDurationCard
              incident={incident}
              isClosed={isClosed}
              isOnHold={isOnHold}
              isPendingConfirm={isPendingConfirm}
              isManager={isManager}
              nowMs={now}
              onIncidentUpdated={setIncident}
              showToast={showToast}
            />

            <TriageSelectorsCard
              incident={incident}
              categories={categories}
              rootCauseTree={rootCauseTree}
              isClosed={isClosed}
              isManager={isManager}
              onIncidentUpdated={setIncident}
              onRootCauseTreeUpdated={setRootCauseTree}
              onDataMutated={refreshIncident}
              onClearFeedback={() => setResolutionFeedback(null)}
              showToast={showToast}
            />

            <ReportAttachmentsCard
              attachments={reportAttachments}
              isClosed={isClosed}
              isManager={isManager}
              uploadingKind={uploadingKind}
              deletingAttId={deletingAttId}
              onUpload={handleUploadAttachments}
              onPaste={handlePasteImages}
              onPreview={setPreviewAtt}
              onDelete={handleDeleteAttachment}
            />

            <McpPreviewAccordion
              incident={incident}
              resolutionText={resolutionText}
              showToast={showToast}
            />
          </div>
        </div>
      </div>

      <AttachmentPreviewModal attachment={previewAtt} onClose={() => setPreviewAtt(null)} />

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
