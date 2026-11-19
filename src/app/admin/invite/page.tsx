'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [checking, setChecking] = useState(true);
  const [inviteInfo, setInviteInfo] = useState<{ email: string; name: string; role: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('ไม่พบลิงก์คำเชิญ (Missing invite token)');
      setChecking(false);
      return;
    }

    fetch(`/api/users/invite?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError(d.error || 'ลิงก์คำเชิญไม่ถูกต้องหรือหมดอายุ');
        } else {
          setInviteInfo(d);
          setName(d.name || '');
        }
      })
      .catch(() => setError('ไม่สามารถตรวจสอบคำเชิญได้'))
      .finally(() => setChecking(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/users/invite', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'ไม่สามารถสร้างบัญชีได้');
        setSubmitting(false);
        return;
      }

      router.push('/admin');
      router.refresh();
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="w-full min-h-[calc(100vh-4rem)] flex items-center justify-center text-xs font-mono text-slate-500">
        <span className="material-symbols-outlined animate-spin text-sky-600 mr-2">sync</span>
        Verifying Invitation...
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#f0f7ff] via-slate-50 to-[#f0f7ff] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-sky-100 overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-slate-100 bg-gradient-to-r from-sky-50/80 to-white text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-sky-600 text-white flex items-center justify-center mx-auto shadow-md shadow-sky-600/20">
            <span className="material-symbols-outlined text-[26px]">mail_lock</span>
          </div>
          <h1 className="text-xl font-headline font-bold text-slate-900">ตั้งรหัสผ่านบัญชีผู้ดูแลระบบ</h1>
          <p className="text-xs text-slate-500">ใช้ Email ที่ได้รับเชิญและตั้งรหัสผ่านเพื่อเข้าร่วมทีม IncidentHub</p>
        </div>

        {!inviteInfo ? (
          <div className="p-6 sm:p-8 text-center space-y-4">
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
              {error || 'ลิงก์คำเชิญไม่สามารถใช้งานได้'}
            </div>
            <Link
              href="/admin/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
            >
              ไปหน้าเข้าสู่ระบบ
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
            <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Email ที่ได้รับเชิญ:</span>
                <span className="font-mono font-semibold text-slate-900">{inviteInfo.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">สิทธิ์การใช้งาน (Role):</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    inviteInfo.role === 'MANAGER'
                      ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                      : 'bg-sky-100 text-sky-800 border border-sky-200'
                  }`}
                >
                  {inviteInfo.role}
                </span>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">ชื่อแสดงผล (Display Name)</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Password * (≥ 4 ตัวอักษร)</label>
              <input
                type="password"
                required
                minLength={4}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">ยืนยัน Password *</label>
              <input
                type="password"
                required
                minLength={4}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-semibold text-xs shadow-md shadow-sky-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">
                {submitting ? 'sync' : 'check_circle'}
              </span>
              <span>{submitting ? 'กำลังสร้างบัญชี...' : 'ยืนยันสร้างบัญชีและเข้าใช้งาน'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AdminInvitePage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-slate-500">Loading...</div>}>
      <AcceptInviteForm />
    </Suspense>
  );
}
