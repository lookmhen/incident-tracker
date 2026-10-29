'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface AttachedFile {
  file: File;
  previewUrl: string;
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
  const [urgency, setUrgency] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [attachment, setAttachment] = useState<AttachedFile | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<{
    ticketNo: string;
    urgency: string;
    title: string;
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

  // Helper to process an image file (Upload or Clipboard)
  const handleProcessFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('รองรับเฉพาะไฟล์รูปภาพ (PNG, JPG, GIF, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('ขนาดไฟล์เกินกำหนด (ไม่เกิน 5MB)');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    setAttachment({
      file,
      previewUrl,
      name: file.name || `screenshot_${Date.now()}.png`,
      sizeFormatted: `${sizeMb} MB`,
    });
  };

  // Global Ctrl+V Clipboard Listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            handleProcessFile(file);
          }
          break;
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
    if (!reporterName.trim() || !contactInfo.trim()) {
      alert('กรุณากรอกชื่อผู้แจ้งและช่องทางติดต่อ');
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
    setUrgency('MEDIUM');
    setAttachment(null);
    setSubmittedTicket(null);
  };

  const handleCopyTicket = (ticketNo: string) => {
    navigator.clipboard.writeText(ticketNo);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
                ระบบได้ส่งแจ้งเตือนเข้าห้อง Microsoft Teams ของทีม IT เรียบร้อยแล้ว เจ้าหน้าที่จะดำเนินการตรวจสอบโดยเร็วที่สุด
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
                  href={`/admin/incidents/${submittedTicket.ticketNo}`}
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
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Teams Webhook Dispatched</span>
              </span>
              <span className="font-mono text-slate-500">SLA: &lt; 30 mins</span>
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
                      ชื่อ-นามสกุล ผู้แจ้ง <span className="text-red-500">*</span>
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
                    แผนก (Department)
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3.5 top-2.5 text-[18px] text-slate-400">corporate_fare</span>
                    <input
                      id="department"
                      type="text"
                      value={department}
                      onChange={(e) => {
                        setDepartment(e.target.value);
                        saveIdentity(reporterName, e.target.value, contactInfo);
                      }}
                      placeholder="เช่น บัญชี, คลังสินค้า, IT, ฝ่ายขาย..."
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

              {/* Urgency Selector (Clean 3 Buttons) */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-label font-medium text-slate-700 flex items-center justify-between">
                  <span>ระดับความเร่งด่วน (Urgency)</span>
                  <span className="text-[11px] text-slate-500">ผลกระทบต่อการทำงาน</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* High */}
                  <button
                    type="button"
                    onClick={() => setUrgency('HIGH')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      urgency === 'HIGH'
                        ? 'bg-red-50 border-red-500 text-red-800 shadow-xs ring-1 ring-red-400'
                        : 'bg-slate-50/70 border-slate-200 hover:bg-red-50/50 text-slate-700'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-red-600"></span>
                    <span className="font-semibold">🔴 สูง (High)</span>
                    <span className="text-[10px] text-slate-500 text-center leading-tight">ระบบล่ม / ทำงานไม่ได้</span>
                  </button>

                  {/* Medium */}
                  <button
                    type="button"
                    onClick={() => setUrgency('MEDIUM')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      urgency === 'MEDIUM'
                        ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-xs ring-1 ring-amber-400'
                        : 'bg-slate-50/70 border-slate-200 hover:bg-amber-50/50 text-slate-700'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span className="font-semibold">🟡 ปานกลาง (Medium)</span>
                    <span className="text-[10px] text-slate-500 text-center leading-tight">ติดขัด / พอมีทางเลี่ยง</span>
                  </button>

                  {/* Low */}
                  <button
                    type="button"
                    onClick={() => setUrgency('LOW')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      urgency === 'LOW'
                        ? 'bg-sky-50 border-sky-500 text-sky-900 shadow-xs ring-1 ring-sky-400'
                        : 'bg-slate-50/70 border-slate-200 hover:bg-sky-50/50 text-slate-700'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                    <span className="font-semibold">🟢 ทั่วไป (Low)</span>
                    <span className="text-[10px] text-slate-500 text-center leading-tight">ขอสิทธิ์ / คำถามทั่วไป</span>
                  </button>
                </div>
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

              {/* Screenshot Dropzone */}
              <div className="space-y-2">
                <label className="text-xs font-label font-medium text-slate-700 flex items-center justify-between">
                  <span>แนบรูปภาพหน้าจอ (Screenshot)</span>
                  <span className="text-[11px] text-sky-700 font-mono">PNG, JPG ไม่เกิน 5MB</span>
                </label>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) handleProcessFile(e.target.files[0]);
                  }}
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                />

                {attachment ? (
                  /* Attached Preview Card */
                  <div className="flex items-center justify-between p-3 rounded-xl bg-sky-50/70 border border-sky-200 shadow-2xs">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={attachment.previewUrl}
                        alt="Preview"
                        className="w-12 h-12 object-cover rounded-lg border border-sky-200 shrink-0"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-mono font-medium text-slate-900 truncate">
                          {attachment.name}
                        </span>
                        <span className="text-[11px] text-slate-500">{attachment.sizeFormatted}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white transition-colors cursor-pointer"
                      title="ลบรูปภาพ"
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
                      add_photo_alternate
                    </span>
                    <p className="text-xs font-medium text-slate-700">
                      คลิกเพื่อเลือกรูป หรือลากรูปมาวางที่นี่
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      หรือกด <kbd className="px-1 py-0.5 rounded bg-slate-100 border text-slate-700 text-[10px] font-mono">Ctrl+V</kbd> เพื่อวางรูปจาก Clipboard ได้ทันที
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
