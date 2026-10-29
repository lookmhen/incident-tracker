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
  status: string;
  assignedTo: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
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
  const [loading, setLoading] = useState(true);

  // Resolution editor state
  const [resolutionText, setResolutionText] = useState('');

  // Edit Incident Details state
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  // Dump Inspector Modal
  const [showDumpModal, setShowDumpModal] = useState(false);

  // Status message / toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchIncident = async () => {
    try {
      const res = await fetch(`/api/incidents/${id}`);
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

  useEffect(() => {
    fetchIncident();
    fetchCategories();
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
        setIncident({ ...incident, category: catName });
        showToast(`Category updated to ${catName}`);
      }
    } catch (e) {
      console.error(e);
    }
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
        setIncident({
          ...incident,
          assignedTo: 'Admin (Me)',
          status: 'IN_PROGRESS',
        });
        showToast('Claimed ticket • Status set to IN_PROGRESS');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Update Status
  const handleUpdateStatus = async (newStatus: string) => {
    if (!incident) return;
    try {
      const res = await fetch(`/api/incidents/${incident.ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setIncident({ ...incident, status: newStatus });
        showToast(`Status updated to ${newStatus}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Sanitize Text
  const handleSanitizeText = () => {
    const cleaned = resolutionText
      .replace(/<[^>]*>/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[`*#_~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    setResolutionText(cleaned);
    showToast('Corpus sanitized for MCP vector readiness');
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
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Copy JSON Payload for External MCP Client
  const handleCopyJson = () => {
    if (!incident) return;
    const payload = {
      mcp_resource_uri: `mcp://incidenthub/incidents/${incident.ticketNo}`,
      ticketNo: incident.ticketNo,
      category: incident.category || 'General',
      urgency: incident.urgency,
      status: incident.status,
      clean_text_corpus: resolutionText,
      remediation_tags: ['RFC_TIMEOUT', 'SM50_WORKPROCESS', 'SM59_DESTINATION'],
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('Copied MCP Schema JSON payload');
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
  const charCount = resolutionText.length;
  const wordCount = resolutionText.trim() ? resolutionText.trim().split(/\s+/).length : 0;

  return (
    <div className="w-full bg-[#f0f7ff] min-h-[calc(100vh-4rem)]">
      <div className="relative w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Ambient Blobs */}
        <div className="absolute -top-32 left-1/4 w-96 h-96 bg-sky-200/40 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute top-1/2 right-10 w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[140px] pointer-events-none"></div>

        {/* Top Incident Header Crisp White Glass Card */}
        <section className="relative bg-white/95 backdrop-blur-xl rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.06)] border border-sky-100 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-sky-400 via-blue-500 to-sky-300"></div>
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
                  {incident.category || 'General IT'}
                </span>

                <span className="text-slate-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px]">schedule</span>
                  Logged {new Date(incident.createdAt).toLocaleTimeString()}
                </span>
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
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-sky-700">dns</span>
                  <span>
                    Cluster: <strong className="text-slate-700">PROD-AP02</strong>
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
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 hidden group-hover:flex flex-col gap-1 z-20 min-w-[140px]">
                  {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((st) => (
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

              {/* Attachment Block */}
              <div className="pt-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-sky-600">attachment</span>
                  Attached Diagnostics Dump ({incident.attachments.length} File)
                </div>

                {incident.attachments.length > 0 ? (
                  incident.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-sky-50/60 border border-sky-200/80 hover:bg-sky-50 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
                          <span className="material-symbols-outlined text-[22px]">image</span>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-800 font-mono">
                            {att.fileName || 'sap_error_dump_0918.png'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {att.fileType} • {att.fileSize ? `${(att.fileSize / 1024).toFixed(0)} KB` : '1.42 MB'} • Validated
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowDumpModal(true)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-sky-600 hover:text-white hover:border-sky-600 text-xs text-slate-700 font-medium flex items-center gap-1.5 transition-all shadow-xs"
                      >
                        <span className="material-symbols-outlined text-[15px]">visibility</span>
                        <span>Inspect Preview</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-sky-50/60 border border-sky-200/80 hover:bg-sky-50 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
                        <span className="material-symbols-outlined text-[22px]">image</span>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-800 font-mono">sap_error_dump_0918.png</div>
                        <div className="text-[11px] text-slate-500">PNG Image • 1.42 MB • SHA256: 8f4a2...c91</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowDumpModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-sky-600 hover:text-white hover:border-sky-600 text-xs text-slate-700 font-medium flex items-center gap-1.5 transition-all shadow-xs"
                    >
                      <span className="material-symbols-outlined text-[15px]">visibility</span>
                      <span>Inspect Preview</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Dynamic Category & Triage Routing Selector */}
            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.05)] border border-sky-100 space-y-3.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-headline font-bold text-slate-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-sky-600">alt_route</span>
                  Category &amp; Operational Routing
                </label>
                <span className="text-[11px] text-slate-500 font-medium">Dynamic Triage Queue</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {categories.map((cat) => {
                  const isSelected = incident.category === cat.name;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleSelectCategory(cat.name)}
                      className={`py-2.5 px-3 rounded-xl flex flex-col items-center gap-1 transition-all text-xs font-semibold ${
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
                      <span>{cat.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200/80 text-[11px] text-slate-600 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-sky-600">verified_user</span>
                  Target Queue: <strong className="text-slate-900">{incident.category || 'Triage'}</strong>
                </span>
                <span className="text-sky-700 font-mono font-bold">SLA: 45m left</span>
              </div>
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
            {/* MCP Schema & External Endpoint Payload */}
            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(2,132,199,0.05)] border border-sky-100 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
                    <span className="material-symbols-outlined text-[17px]">api</span>
                  </span>
                  <div>
                    <h3 className="text-xs font-headline font-bold text-slate-900">MCP Endpoint Schema &amp; Export</h3>
                    <p className="text-[10px] text-slate-500">Standardized payload for external LLM / MCP tools</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <a
                    href={`/api/mcp/v1/context?ticketNo=${incident.ticketNo}`}
                    target="_blank"
                    className="px-2 py-1 rounded bg-slate-50 hover:bg-sky-50 border border-slate-200 text-[11px] text-sky-700 font-mono transition-colors"
                    title="Open API endpoint directly"
                  >
                    API Link
                  </a>
                  <button
                    onClick={handleCopyJson}
                    className="px-2.5 py-1 rounded bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-[11px] text-sky-700 font-mono font-medium flex items-center gap-1 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[13px]">
                      {copied ? 'check' : 'content_copy'}
                    </span>
                    <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                  </button>
                </div>
              </div>

              {/* Status metrics */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-medium">Schema</div>
                  <div className="text-xs font-bold text-sky-700 font-mono mt-0.5">mcp.incident.v1</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-medium">Protocol</div>
                  <div className="text-xs font-bold text-slate-700 font-mono mt-0.5">REST / JSON</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-medium">Text Corpus</div>
                  <div className="text-xs font-bold text-emerald-700 font-mono mt-0.5">100% Clean</div>
                </div>
              </div>

              {/* Code Payload Preview */}
              <div className="relative bg-slate-900 rounded-xl p-3.5 font-mono text-[11px] leading-relaxed text-slate-200 shadow-inner overflow-x-auto border border-slate-800">
                <pre className="text-slate-200 selection:bg-sky-700">
                  {JSON.stringify(
                    {
                      mcp_resource_uri: `mcp://incidenthub/incidents/${incident.ticketNo}`,
                      ticketNo: incident.ticketNo,
                      category: incident.category || 'General',
                      urgency: incident.urgency,
                      status: incident.status,
                      clean_text_corpus: resolutionText.slice(0, 180) + '...',
                      remediation_tags: ['RFC_TIMEOUT', 'SM50_WORKPROCESS', 'SM59_DESTINATION'],
                    },
                    null,
                    2
                  )}
                </pre>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-sky-600">sensors</span>
                  Endpoint:{' '}
                  <code className="text-slate-900 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded font-mono">
                    /api/mcp/v1/context?ticketNo={incident.ticketNo}
                  </code>
                </span>
                <span className="text-sky-700 font-mono text-[10px] font-semibold">External Client Ready</span>
              </div>
            </div>

            {/* Architecture Separation Notice */}
            <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(2,132,199,0.05)] border border-sky-100 flex items-start gap-3">
              <span className="material-symbols-outlined text-sky-600 text-[20px] shrink-0 mt-0.5">info</span>
              <div className="space-y-1 text-xs text-slate-600 leading-relaxed">
                <div className="font-bold text-slate-900">Decoupled MCP Architecture</div>
                <p className="text-[11px] text-slate-500">
                  AI insights and pattern clustering run completely outside the web application via MCP clients querying the API or database directly. The web portal maintains zero heavy AI runtime overhead.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Dump Preview Dialog */}
      {showDumpModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-sky-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-red-600">bug_report</span>
                <span className="text-sm font-bold text-slate-900 font-mono">
                  Diagnostics Stack Snapshot ({incident.ticketNo})
                </span>
              </div>
              <button
                onClick={() => setShowDumpModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Simulated Screenshot / Dump view */}
            <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-red-400 space-y-2 overflow-x-auto shadow-inner border border-slate-800">
              <div className="text-slate-400 text-[11px]">SAP GUI Release 770 Final [Build 192830] System ID: PRD Client: 100</div>
              <div className="p-2 bg-red-950/60 border border-red-800 rounded text-red-300 font-bold">
                SYSTEM ERROR: RFC_COMMUNICATION_FAILURE (Destination AP02_RFC)
              </div>
              <div className="text-slate-300 text-[11px] leading-relaxed">
                Runtime Errors: CALL_FUNCTION_REMOTE_ERROR
                <br />
                ABAP Program: SAPMSSY1
                <br />
                Termination type: RFC_ERROR_SYSTEMFAILURE
                <br />
                Error text: &quot;CPIC-CALL: &apos;ThSAPCMINIT&apos; : cmRc=17 thRc=243 Connection to partner broken.&quot;
                <br />
                Server Context: sap-prd-ap02_PRD_00 (Work Process WP03, Dialog)
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-2">
              <span className="text-slate-500 font-medium">OCR Analysis: 100% matched error token RFC_COMMUNICATION_FAILURE</span>
              <button
                onClick={() => setShowDumpModal(false)}
                className="px-4 py-2 rounded-xl bg-sky-600 text-white font-semibold text-xs hover:bg-sky-700 transition-colors"
              >
                Close Inspector
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
