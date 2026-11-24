'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getPublicTrackStage } from '@/lib/track-status';

interface TrackedIncident {
  ticketNo: string;
  title: string;
  description: string;
  category: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
  status: string;
  createdAt: string;
  closedAt: string | null;
  resolution: string | null;
  resolutionType: string | null;
  workaroundNote: string | null;
}

function TrackContent() {
  const searchParams = useSearchParams();
  const queryTicket = searchParams.get('ticket') || '';

  const [ticketInput, setTicketInput] = useState(queryTicket);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TrackedIncident | null>(null);

  const fetchTicket = async (tNo: string) => {
    const clean = tNo.trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setTicket(null);

    try {
      const res = await fetch(`/api/track/${encodeURIComponent(clean)}`, { cache: 'no-store' });
      if (res.status === 404) {
        setError(`ไม่พบหมายเลข Ticket "${clean}" ในระบบ`);
      } else if (!res.ok) {
        setError('เกิดข้อผิดพลาดในการค้นหาข้อมูล');
      } else {
        const data = await res.json();
        setTicket(data);
      }
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (queryTicket) {
      setTicketInput(queryTicket);
      fetchTicket(queryTicket);
    }
  }, [queryTicket]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTicket(ticketInput);
  };

  // Status mapping (PENDING_CONFIRM shows as completed on public /track while internal workflow remains intact)
  const { isCompletedForUser, isInProgress, progressWidth, step2Note } = getPublicTrackStage(ticket?.status);

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-[#f5f7fa] py-10 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-headline font-semibold text-slate-900 tracking-tight">
            ติดตามสถานะการแจ้งปัญหา
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            กรอกหมายเลข Ticket เช่น <code className="bg-slate-100 text-slate-800 border border-slate-200 px-1.5 py-0.5 rounded font-mono">INC-202611-0001</code> หรือเลขท้าย 4 หลัก
          </p>
        </div>

        {/* Search Bar Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-3 sm:p-4 shadow-xs border border-slate-200 flex gap-2">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
              tag
            </span>
            <input
              type="text"
              value={ticketInput}
              onChange={(e) => setTicketInput(e.target.value)}
              placeholder="ระบุหมายเลข Ticket (เช่น INC-202611-0001 หรือ 0001)"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !ticketInput.trim()}
            className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            {loading ? (
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">search</span>
            )}
            <span>ค้นหา</span>
          </button>
        </form>

        {/* Error State */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[22px]">error</span>
            </div>
            <p className="text-sm font-semibold text-rose-800">{error}</p>
            <p className="text-xs text-rose-600">โปรดตรวจสอบหมายเลข Ticket ที่ได้รับตอนแจ้งปัญหาอีกครั้ง</p>
          </div>
        )}

        {/* Ticket Details Card */}
        {ticket && (
          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
            {/* Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs font-label font-medium text-slate-500 block">
                  หมายเลข Ticket
                </span>
                <span className="text-xl sm:text-2xl font-mono tabular-nums font-semibold text-sky-700">
                  {ticket.ticketNo}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md text-xs font-medium border bg-slate-50 text-slate-700 border-slate-200">
                  {ticket.category}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                    ticket.urgency === 'HIGH'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : ticket.urgency === 'MEDIUM'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-sky-50 text-sky-700 border-sky-200'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      ticket.urgency === 'HIGH'
                        ? 'bg-red-600'
                        : ticket.urgency === 'MEDIUM'
                        ? 'bg-amber-500'
                        : 'bg-sky-600'
                    }`}
                  />
                  {ticket.urgency === 'HIGH' ? 'ด่วนมาก' : ticket.urgency === 'MEDIUM' ? 'ปานกลาง' : 'ทั่วไป'}
                </span>
              </div>
            </div>

            {/* Stepper Timeline */}
            <div className="py-2">
              <div className="grid grid-cols-3 relative">
                {/* Connecting track */}
                <div className="absolute top-1/2 left-[16.6%] right-[16.6%] h-1 -translate-y-1/2 bg-slate-100 z-0">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{
                      width: progressWidth,
                    }}
                  />
                </div>

                {/* Step 1: แจ้งเรื่องแล้ว */}
                <div className="flex flex-col items-center text-center z-10">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                    <span className="material-symbols-outlined text-[16px]">check</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-800 mt-2">แจ้งเรื่องแล้ว</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(ticket.createdAt).toLocaleDateString('th-TH')}
                  </span>
                </div>

                {/* Step 2: ดำเนินการ */}
                <div className="flex flex-col items-center text-center z-10">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-xs ${
                      isCompletedForUser || isInProgress
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isCompletedForUser ? (
                      <span className="material-symbols-outlined text-[16px]">check</span>
                    ) : isInProgress ? (
                      <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                    ) : (
                      '2'
                    )}
                  </div>
                  <span
                    className={`text-xs font-semibold mt-2 ${
                      isCompletedForUser || isInProgress ? 'text-slate-800' : 'text-slate-400'
                    }`}
                  >
                    กำลังดำเนินการ
                  </span>
                  <span className="text-[10px] text-slate-400">{step2Note}</span>
                </div>

                {/* Step 3: แก้ไขเสร็จสิ้น */}
                <div className="flex flex-col items-center text-center z-10">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-xs ${
                      isCompletedForUser ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isCompletedForUser ? (
                      <span className="material-symbols-outlined text-[16px]">check</span>
                    ) : (
                      '3'
                    )}
                  </div>
                  <span
                    className={`text-xs font-semibold mt-2 ${
                      isCompletedForUser ? 'text-emerald-700 font-bold' : 'text-slate-400'
                    }`}
                  >
                    เสร็จสิ้น
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {ticket.closedAt ? new Date(ticket.closedAt).toLocaleDateString('th-TH') : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Incident Summary */}
            <div className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">{ticket.title}</h3>
              <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                {ticket.description}
              </p>
            </div>

            {/* Resolution info if completed for user */}
            {isCompletedForUser && ticket.resolution && (
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                  <span>บันทึกการแก้ไขปัญหา</span>
                </div>
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {ticket.resolution}
                </p>
                {ticket.resolutionType === 'WORKAROUND' && ticket.workaroundNote && (
                  <div className="mt-2 pt-2 border-t border-emerald-200/60 text-xs text-amber-800">
                    <span className="font-semibold">ข้อควรปฏิบัติ (Workaround):</span> {ticket.workaroundNote}
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 text-center">
              <Link
                href="/"
                className="text-xs text-sky-600 hover:text-sky-700 font-medium hover:underline inline-flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                <span>กลับสู่หน้าแจ้งปัญหา</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full min-h-[calc(100vh-4rem)] flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl animate-spin text-sky-600">
            progress_activity
          </span>
        </div>
      }
    >
      <TrackContent />
    </Suspense>
  );
}
