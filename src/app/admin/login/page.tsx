'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('from') || '/admin';

  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'รหัสผ่านไม่ถูกต้อง');
        setLoading(false);
        return;
      }

      router.push(redirectPath);
      router.refresh();
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#f0f7ff] via-slate-50 to-[#f0f7ff] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-sky-100 overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-slate-100 bg-gradient-to-r from-sky-50/80 to-white text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-sky-600 text-white flex items-center justify-center mx-auto shadow-md shadow-sky-600/20">
            <span className="material-symbols-outlined text-[26px]">admin_panel_settings</span>
          </div>
          <h1 className="text-xl font-headline font-bold text-slate-900">IT Admin Console Access</h1>
          <p className="text-xs text-slate-500">
            กรุณากรอกรหัสผ่านผู้ดูแลระบบ (Admin Passcode) เพื่อเข้าถึงโซนจัดการเคสและตั้งค่า API
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">Admin Passcode</label>
            <div className="relative">
              <input
                type="password"
                required
                autoFocus
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600 font-mono"
              />
              <span className="material-symbols-outlined text-[18px] text-slate-400 absolute right-3.5 top-2.5">
                key
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              กำหนดค่าได้ผ่านตัวแปร <code className="font-mono text-slate-600">ADMIN_PASSCODE</code> ในไฟล์ <code className="font-mono text-slate-600">.env</code>
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-semibold text-sm shadow-md shadow-sky-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">
              {loading ? 'sync' : 'login'}
            </span>
            <span>{loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบผู้ดูแล (Unlock Console)'}</span>
          </button>

          <div className="pt-2 text-center">
            <Link href="/" className="text-xs text-slate-500 hover:text-sky-600 inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              <span>กลับหน้าแจ้งปัญหาสำหรับผู้ใช้ทั่วไป</span>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-slate-500">Loading...</div>}>
      <AdminLoginForm />
    </Suspense>
  );
}
