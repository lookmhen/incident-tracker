'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import DepartmentInput from '@/components/DepartmentInput';
import {
  ALLOWED_ATTACHMENT_LABEL,
  ATTACHMENT_ACCEPT,
  fallbackAttachmentFileName,
  getAttachmentIcon,
  isAllowedAttachment,
  isImageAttachment,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
} from '@/lib/attachments';

interface AttachedFile {
  file: File;
  previewUrl: string | null;
  icon: string;
  name: string;
  sizeFormatted: string;
}

export default function SimplePublicReportPortal() {
  // Reporter identity fields (directly editable, auto-saved to localStorage)
  const [reporterName, setReporterName] = useState('');
  const [department, setDepartment] = useState('');
  const [contactInfo, setContactInfo] = useState('');

  // Form values
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('LOW');
  const [showUrgencyGuide, setShowUrgencyGuide] = useState(false);
  const [attachment, setAttachment] = useState<AttachedFile | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<{
    ticketNo: string;
    urgency: string;
    title: string;
    status: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load identity from LocalStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem('incidenthub_reporter_identity');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.reporterName) setReporterName(parsed.reporterName);
        if (parsed.department) setDepartment(parsed.department);
        if (parsed.contactInfo) setContactInfo(parsed.contactInfo);
      }
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }, []);

  // Save identity to LocalStorage
  const saveIdentity = (name: string, dept: string, contact: string) => {
    try {
      localStorage.setItem(
        'incidenthub_reporter_identity',
        JSON.stringify({ reporterName: name, department: dept, contactInfo: contact })
      );
    } catch (e) {}
  };

  // Helper to process an uploaded or pasted file
  const handleProcessFile = (file: File) => {
    if (!isAllowedAttachment(file.name, file.type)) {
      alert(`ไม่รองรับไฟล์ "${file.name}" (รองรับ: ${ALLOWED_ATTACHMENT_LABEL})`);
      return;
    }
    if (file.size === 0) {
      alert('ไม่สามารถแนบไฟล์ว่าง (0 bytes) ได้');
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      alert(`ขนาดไฟล์เกินกำหนด (ไม่เกิน ${MAX_ATTACHMENT_MB}MB)`);
      return;
    }

    const fileName = file.name || fallbackAttachmentFileName(file.type);
    const isImg = isImageAttachment(fileName, file.type);
    const previewUrl = isImg ? URL.createObjectURL(file) : null;
    const sizeFormatted =
      file.size >= 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    setAttachment({
      file,
      previewUrl,
      icon: getAttachmentIcon(fileName, file.type),
      name: fileName,
      sizeFormatted,
    });
  };

  useEffect(() => {
    const previewUrl = attachment?.previewUrl;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [attachment?.previewUrl]);

  // Global Ctrl+V Clipboard Listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file && isAllowedAttachment(file.name, file.type)) {
            handleProcessFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Drag & Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reporterName.trim() || !department.trim() || !contactInfo.trim()) {
      alert('กรุณากรอกชื่อผู้แจ้ง แผนก และช่องทางติดต่อให้ครบถ้วน');
      return;
    }
    if (!title.trim() || !description.trim()) {
      alert('กรุณากรอกหัวข้อและรายละเอียดปัญหา');
      return;
    }

    setIsSubmitting(true);
    saveIdentity(reporterName, department, contactInfo);

    try {
      const formData = new FormData();
      formData.append('reporterName', reporterName.trim());
      formData.append('department', department.trim());
      formData.append('contactInfo', contactInfo.trim() || '-');
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('urgency', urgency);

      if (attachment) {
        formData.append('attachment', attachment.file);
      }

      const res = await fetch('/api/incidents', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to submit incident');
      }

      const created = await res.json();
      setSubmittedTicket({
        ticketNo: created.ticketNo,
        urgency: created.urgency,
        title: created.title,
        status: created.status || 'OPEN',
      });
    } catch (err: any) {
      alert(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForNew = () => {
    setTitle('');
    setDescription('');
    setUrgency('LOW');
    setAttachment(null);
    setSubmittedTicket(null);
  };

  const handleCopyTicket = async (ticketNo: string) => {
    let ok = false;
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(ticketNo);
        ok = true;
      }
    } catch {}
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = ticketNo;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#f0f7ff] via-slate-50 to-[#f0f7ff] py-8 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        {/* Success State View */}
        {submittedTicket ? (
          <div className="bg-white rounded-2xl p-8 sm:p-10 shadow-lg border border-sky-100 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <span className="material-symbols-outlined text-[36px]">check_circle</span>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-headline font-bold text-slate-900">บันทึกแจ้งปัญหาเรียบร้อยแล้ว!</h2>
              <p className="text-sm text-slate-600">
                ระบบได้บันทึกข้อมูลการแจ้งปัญหาเรียบร้อยแล้ว เจ้าหน้าที่จะดำเนินการตรวจสอบโดยเร็วที่สุด
              </p>
            </div>

            {/* Generated Ticket Box */}
            <div className="p-5 rounded-xl bg-sky-50/80 border border-sky-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-left">
                <span className="text-[11px] font-label font-medium text-slate-500 uppercase tracking-wider block">
                  หมายเลข Ticket ของคุณ
                </span>
                <span className="text-2xl font-mono font-bold text-sky-700 tracking-wider">
                  {submittedTicket.ticketNo}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyTicket(submittedTicket.ticketNo)}
                  className="px-3.5 py-2 rounded-lg bg-white border border-sky-200 hover:bg-sky-100 text-sky-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {copied ? 'check' : 'content_copy'}
                  </span>
                  <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอกรหัส'}</span>
                </button>
                <Link
                  href={`/track?ticket=${encodeURIComponent(submittedTicket.ticketNo)}`}
                  className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <span>ติดตามสถานะ</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </Link>
              </div>
            </div>

            {/* Additional Info Pill */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>สถานะ: {submittedTicket.status || 'OPEN'}</span>
              </span>
              <span className="font-mono text-slate-500 font-medium">
                ระดับความสำคัญ: {submittedTicket.urgency || 'MEDIUM'}
              </span>
            </div>

            {/* Reset for another ticket */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleResetForNew}
                className="text-xs text-sky-600 hover:text-sky-700 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                <span>แจ้งปัญหาเพิ่มเติมอีกรายการ</span>
              </button>
            </div>
          </div>
        ) : (
          /* Normal Form State */
          <div className="bg-white rounded-2xl shadow-md border border-sky-100 overflow-hidden">
            {/* Header */}
            <div className="p-6 sm:p-7 border-b border-slate-100 bg-gradient-to-r from-sky-50/70 to-white">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-headline font-bold text-slate-900 tracking-tight">
                    แจ้งปัญหาด้าน IT (Report an Incident)
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    กรอกข้อมูลด้านล่าง หรือกด <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-mono text-[11px] shadow-2xs">Ctrl+V</kbd> เพื่อวางรูปจาก Clipboard ได้ทันที
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[24px]">support_agent</span>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
              {/* Row 1: Reporter Name & Department (Directly editable on page) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-label font-medium text-slate-700 flex items-center justify-between" htmlFor="reporterName">
                    <span>
                      ชื่อ ผู้แจ้ง <span className="text-red-500">*</span>
                    </span>
                    <span className="text-[11px] text-slate-400">จำไว้ในเครื่องอัตโนมัติ</span>
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3.5 top-2.5 text-[18px] text-slate-400">person</span>
                    <input
                      id="reporterName"
                      type="text"
                      required
                      value={reporterName}
                      onChange={(e) => {
                        setReporterName(e.target.value);
                        saveIdentity(e.target.value, department, contactInfo);
                      }}
                      placeholder="พิมพ์ชื่อของคุณ..."
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-all shadow-2xs"
                    />
                  </div>
                </div>

                {/* Department */}
                <div className="space-y-1.5">
                  <label className="text-xs font-label font-medium text-slate-700 block" htmlFor="department">
                    แผนก (Department) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3.5 top-2.5 text-[18px] text-slate-400 z-10 pointer-events-none">
                      corporate_fare
                    </span>
                    <DepartmentInput
                      id="department"
                      required
                      value={department}
                      onChange={(next) => {
                        setDepartment(next);
                        saveIdentity(reporterName, next, contactInfo);
                      }}
                      placeholder="เช่น Packing, บัญชี, คลังสินค้า, IT..."
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-all shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Contact Info (Directly editable on page) */}
              <div className="space-y-1.5">
                <label className="text-xs font-label font-medium text-slate-700 flex items-center justify-between" htmlFor="contactInfo">
                  <span>
                    ช่องทางติดต่อ / เบอร์ต่อ (Contact Info) <span className="text-red-500">*</span>
                  </span>
                  <span className="text-[11px] text-slate-400">เบอร์ต่อภายใน, มือถือ หรืออีเมล</span>
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-2.5 text-[18px] text-slate-400">alternate_email</span>
                  <input
                    id="contactInfo"
                    type="text"
                    required
                    value={contactInfo}
                    onChange={(e) => {
                      setContactInfo(e.target.value);
                      saveIdentity(reporterName, department, e.target.value);
                    }}
                    placeholder="เช่น Ext. 4412, 08x-xxx-xxxx, somchai.p@company.com"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-all shadow-2xs"
                  />
                </div>
              </div>

              {/* Urgency Selector (Clean 3 Buttons + Hover Tooltips + Expandable Guide) */}
              <div className="space-y-2 pt-1">
                <div className="text-xs font-label font-medium text-slate-700 flex items-center justify-between gap-2">
                  <span>ระดับความเร่งด่วน (Urgency)</span>
                  <button
                    type="button"
                    aria-expanded={showUrgencyGuide}
                    onClick={() => setShowUrgencyGuide((prev) => !prev)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[11px] font-semibold cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">help</span>
                    <span>{showUrgencyGuide ? 'ซ่อนเกณฑ์การเลือก' : 'ดูเกณฑ์การเลือก'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    {
                      value: 'LOW' as const,
                      dot: 'bg-sky-500',
                      label: '🟢 ทั่วไป (Low)',
                      short: 'คำขอ / ไม่เร่งด่วน',
                      activeClass: 'bg-sky-50 border-sky-500 text-sky-900 shadow-xs ring-1 ring-sky-400',
                      idleClass: 'bg-slate-50/70 border-slate-200 hover:bg-sky-50/50 text-slate-700',
                      tipHeader: '🟢 ทั่วไป (Low) — ไม่เร่งด่วน / งานคำขอทั่วไป (ค่าเริ่มต้น)',
                      tipAccent: 'border-sky-200 bg-sky-50/40 text-sky-900',
                      tooltipPos: 'sm:left-0',
                      points: [
                        'ขอสิทธิ์ใช้งาน, รีเซ็ตรหัสผ่าน, ขอติดตั้งโปรแกรมหรืออุปกรณ์เสริม',
                        'สอบถามวิธีใช้งาน, ขอรายงาน/แก้ข้อมูลไม่เร่งด่วน, แจ้งซ่อมอุปกรณ์ที่ไม่กระทบงาน',
                      ],
                    },
                    {
                      value: 'MEDIUM' as const,
                      dot: 'bg-amber-500',
                      label: '🟡 ปานกลาง (Medium)',
                      short: 'ติดขัด / พอมีทางเลี่ยง',
                      activeClass: 'bg-amber-50 border-amber-500 text-amber-900 shadow-xs ring-1 ring-amber-400',
                      idleClass: 'bg-slate-50/70 border-slate-200 hover:bg-amber-50/50 text-slate-700',
                      tipHeader: '🟡 ปานกลาง (Medium) — ติดขัดแต่ยังเดินงานต่อได้',
                      tipAccent: 'border-amber-200 bg-amber-50/40 text-amber-900',
                      tooltipPos: 'sm:left-1/2 sm:-translate-x-1/2',
                      points: [
                        'กระทบเฉพาะบางเครื่อง/บางฟังก์ชัน ยังมีทางเลี่ยงชั่วคราว (ไม่หยุดผลิต/ส่งของ)',
                        'เช่น ปริ้นท์ไม่ออกแต่สลับเครื่องได้, โปรแกรมช้า/ค้างบางหน้าจอ, กระทบแค่บางคน',
                      ],
                    },
                    {
                      value: 'HIGH' as const,
                      dot: 'bg-red-600',
                      label: '🔴 สูง (High)',
                      short: 'หยุดผลิต / ขาย-ส่งของไม่ได้',
                      activeClass: 'bg-red-50 border-red-500 text-red-800 shadow-xs ring-1 ring-red-400',
                      idleClass: 'bg-slate-50/70 border-slate-200 hover:bg-red-50/50 text-slate-700',
                      tipHeader: '🔴 สูง (High) — หยุดงานหลักทันที',
                      tipAccent: 'border-red-200 bg-red-50/40 text-red-900',
                      tooltipPos: 'sm:right-0',
                      points: [
                        'กระบวนการผลิตหยุดชะงัก, ขายหรือส่งของให้ลูกค้าไม่ได้',
                        'ระบบหลัก (SAP/ERP, เน็ต, Server) ล่มทั้งแผนกหรือหลายคนทำงานต่อไม่ได้เลย',
                      ],
                    },
                  ].map((opt) => (
                    <div key={opt.value} className="relative group">
                      <button
                        type="button"
                        onClick={() => setUrgency(opt.value)}
                        className={`w-full py-2.5 px-3 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all cursor-pointer ${
                          urgency === opt.value ? opt.activeClass : opt.idleClass
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${opt.dot}`}></span>
                        <span className="font-semibold">{opt.label}</span>
                        <span className="text-[10px] text-slate-500 text-center leading-tight">{opt.short}</span>
                      </button>

                      {/* Desktop Hover Tooltip */}
                      <div
                        role="tooltip"
                        className={`hidden sm:group-hover:block pointer-events-none absolute bottom-full mb-2 z-30 w-64 ${opt.tooltipPos} rounded-xl border border-slate-200 bg-white p-3 shadow-lg text-left space-y-1.5`}
                      >
                        <div className="text-[11px] font-bold text-slate-900">{opt.tipHeader}</div>
                        <ul className="space-y-1 text-[11px] text-slate-600 list-disc pl-4 leading-snug">
                          {opt.points.map((pt) => (
                            <li key={pt}>{pt}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Clickable 3-Level Comparison Guide (Mobile & Desktop friendly) */}
                {showUrgencyGuide && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3.5 space-y-2 text-[11px] text-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px] text-sky-600">info</span>
                        เกณฑ์การเลือกระดับความเร่งด่วน
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowUrgencyGuide(false)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                        aria-label="ปิดเกณฑ์การเลือก"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                    <div className="space-y-1.5 leading-relaxed">
                      <div className="p-2 rounded-lg bg-white border border-red-200/80">
                        <div className="font-semibold text-red-800">🔴 สูง (High) — หยุดงานหลักทันที</div>
                        <p className="text-slate-600">กระบวนการผลิตหยุดชะงัก, ขายหรือส่งของให้ลูกค้าไม่ได้, หรือระบบหลัก (SAP/ERP, เน็ต, Server) ล่มทั้งแผนก</p>
                      </div>
                      <div className="p-2 rounded-lg bg-white border border-amber-200/80">
                        <div className="font-semibold text-amber-900">🟡 ปานกลาง (Medium) — ติดขัดแต่ยังเดินงานต่อได้</div>
                        <p className="text-slate-600">กระทบเฉพาะบางเครื่อง/บางฟังก์ชัน ยังมีทางเลี่ยงชั่วคราว (เช่น ปริ้นท์ไม่ออกแต่สลับเครื่องได้, โปรแกรมช้า/ค้างบางหน้าจอ)</p>
                      </div>
                      <div className="p-2 rounded-lg bg-white border border-sky-200/80">
                        <div className="font-semibold text-sky-900">🟢 ทั่วไป (Low) — ไม่เร่งด่วน / งานคำขอทั่วไป</div>
                        <p className="text-slate-600">ขอสิทธิ์ใช้งาน, รีเซ็ตรหัสผ่าน, ติดตั้งโปรแกรม/อุปกรณ์เสริม, สอบถามวิธีใช้งาน, หรือขอรายงาน/ซ่อมอุปกรณ์ที่ไม่กระทบงาน</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Title Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-label font-medium text-slate-700" htmlFor="title">
                  หัวข้อปัญหาแบบย่อ (Title) <span className="text-red-500">*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น SAP GUI ค้าง, จอฟ้า, ปริ้นท์ไม่ออก, อินเทอร์เน็ตหลุด"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-all shadow-2xs"
                />
              </div>

              {/* Description Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-label font-medium text-slate-700" htmlFor="description">
                  รายละเอียดปัญหา (Description) <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="description"
                  rows={4}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="อธิบายอาการที่พบ รหัส Error Code ที่ขึ้น หรือขั้นตอนที่ทำแล้วเกิดปัญหา..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-xs leading-relaxed focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 resize-y transition-all shadow-2xs"
                />
              </div>

              {/* File Attachment Dropzone */}
              <div className="space-y-2">
                <label className="text-xs font-label font-medium text-slate-700 flex items-center justify-between gap-2">
                  <span>แนบไฟล์ / รูปภาพ (Attachment)</span>
                  <span className="text-[11px] text-sky-700 font-mono">
                    รูปภาพ, PDF, Excel, Word, ZIP ไม่เกิน {MAX_ATTACHMENT_MB}MB
                  </span>
                </label>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) handleProcessFile(e.target.files[0]);
                    e.target.value = '';
                  }}
                  accept={ATTACHMENT_ACCEPT}
                  className="hidden"
                />

                {attachment ? (
                  /* Attached Preview Card */
                  <div className="flex items-center justify-between p-3 rounded-xl bg-sky-50/70 border border-sky-200 shadow-2xs">
                    <div className="flex items-center gap-3 min-w-0">
                      {attachment.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={attachment.previewUrl}
                          alt="Preview"
                          className="w-12 h-12 object-cover rounded-lg border border-sky-200 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-white border border-sky-200 flex items-center justify-center text-sky-600 shrink-0">
                          <span className="material-symbols-outlined text-[24px]">{attachment.icon}</span>
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-mono font-medium text-slate-900 truncate">
                          {attachment.name}
                        </span>
                        <span className="text-[11px] text-slate-500">{attachment.sizeFormatted}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
                        setAttachment(null);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white transition-colors cursor-pointer"
                      title="ลบไฟล์แนบ"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                ) : (
                  /* Simple Dropzone Area */
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    className="flex flex-col items-center justify-center p-5 rounded-xl border-2 border-dashed border-sky-200 hover:border-sky-400 hover:bg-sky-50/40 transition-all cursor-pointer text-center group"
                  >
                    <span className="material-symbols-outlined text-sky-600 text-[26px] mb-1 group-hover:scale-110 transition-transform">
                      attach_file
                    </span>
                    <p className="text-xs font-medium text-slate-700">
                      คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่ (รูปภาพ, PDF, Excel, Word, CSV, ZIP)
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      หรือกด <kbd className="px-1 py-0.5 rounded bg-slate-100 border text-slate-700 text-[10px] font-mono">Ctrl+V</kbd> เพื่อวางรูปภาพจาก Clipboard ได้ทันที
                    </p>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-headline font-semibold text-sm shadow-md shadow-sky-600/25 hover:shadow-lg transition-all cursor-pointer disabled:opacity-70"
                >
                  <span className={`material-symbols-outlined text-[20px] ${isSubmitting ? 'animate-spin' : ''}`}>
                    {isSubmitting ? 'sync' : 'send'}
                  </span>
                  <span>{isSubmitting ? 'กำลังส่งข้อมูล...' : 'ส่งแจ้งปัญหา (Submit Incident)'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
