'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type UserRole = 'STAFF' | 'MANAGER';

interface SessionUser {
  userId: string | null;
  username: string;
  name: string;
  role: UserRole;
}

interface AdminUserItem {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Invite via Email state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('STAFF');
  const [inviting, setInviting] = useState(false);
  const [generatedInvite, setGeneratedInvite] = useState<{
    url: string;
    emailSent: boolean;
    message: string;
  } | null>(null);

  // Create form state (Email is primary login identifier)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('STAFF');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit modal state
  const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('STAFF');
  const [editPassword, setEditPassword] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // Row action busy state
  const [busyId, setBusyId] = useState<string | null>(null);

  const showToast = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const authRes = await fetch('/api/auth/admin', { cache: 'no-store' });
      const authData = await authRes.json();
      const user: SessionUser | null = authData.authenticated ? authData.user || null : null;
      setSessionUser(user);

      if (user?.role === 'MANAGER') {
        const usersRes = await fetch('/api/users', { cache: 'no-store' });
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setUsers(usersData.users || []);
        }
      }
    } catch {
      showToast('err', 'ไม่สามารถโหลดข้อมูลผู้ใช้งานได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const refreshUsers = async () => {
    const res = await fetch('/api/users', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users || []);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setGeneratedInvite(null);
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, name: inviteName, role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('err', data.error || 'สร้างลิงก์คำเชิญไม่สำเร็จ');
        return;
      }
      setGeneratedInvite({
        url: data.inviteUrl,
        emailSent: Boolean(data.emailSent),
        message: data.emailMessage || '',
      });
      setInviteEmail('');
      setInviteName('');
      setInviteRole('STAFF');
      showToast(
        'ok',
        data.emailSent
          ? 'ส่งลิงก์เชิญเข้า Email แล้ว (คัดลอกลิงก์สำรองได้ด้านล่าง)'
          : 'สร้างลิงก์เชิญสำเร็จ (SMTP ปิดอยู่ — คัดลอกลิงก์ส่งต่อได้ทันที)'
      );
    } catch {
      showToast('err', 'เกิดข้อผิดพลาดในการสร้างคำเชิญ');
    } finally {
      setInviting(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, role, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('err', data.error || 'สร้างผู้ใช้งานไม่สำเร็จ');
        return;
      }
      setName('');
      setEmail('');
      setRole('STAFF');
      setPassword('');
      await refreshUsers();
      showToast('ok', `เพิ่มผู้ใช้ "${data.user?.email || data.user?.username}" เรียบร้อยแล้ว`);
    } catch {
      showToast('err', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (user: AdminUserItem, nextRole: UserRole) => {
    if (user.role === nextRole) return;
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('err', data.error || 'เปลี่ยนสิทธิ์ไม่สำเร็จ');
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === user.id ? data.user : u)));
      showToast('ok', `อัปเดตสิทธิ์ของ ${user.username} เป็น ${nextRole} แล้ว`);
    } catch {
      showToast('err', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (user: AdminUserItem) => {
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('err', data.error || 'อัปเดตสถานะไม่สำเร็จ');
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === user.id ? data.user : u)));
      showToast(
        'ok',
        `${user.username}: ${data.user.isActive ? 'เปิดใช้งานบัญชีแล้ว' : 'ระงับบัญชีชั่วคราวแล้ว'}`
      );
    } catch {
      showToast('err', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setBusyId(null);
    }
  };

  const openEditModal = (user: AdminUserItem) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email || '');
    setEditRole(user.role);
    setEditPassword('');
    setEditActive(user.isActive);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    try {
      const payload: Record<string, unknown> = {
        name: editName,
        email: editEmail,
        role: editRole,
        isActive: editActive,
      };
      if (editPassword.length > 0) {
        payload.password = editPassword;
      }

      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('err', data.error || 'บันทึกการแก้ไขไม่สำเร็จ');
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? data.user : u)));
      setEditingUser(null);
      showToast('ok', `อัปเดตข้อมูลผู้ใช้ ${data.user.username} เรียบร้อยแล้ว`);
    } catch {
      showToast('err', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (user: AdminUserItem) => {
    if (!window.confirm(`ยืนยันการลบผู้ใช้งาน "${user.username}" (${user.name}) ?`)) {
      return;
    }
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast('err', data.error || 'ลบผู้ใช้งานไม่สำเร็จ');
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      showToast('ok', `ลบผู้ใช้งาน ${user.username} เรียบร้อยแล้ว`);
    } catch {
      showToast('err', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-96 flex items-center justify-center text-xs font-mono text-slate-500">
        <span className="material-symbols-outlined animate-spin text-sky-600 mr-2">sync</span>
        Loading User Management...
      </div>
    );
  }

  if (sessionUser?.role !== 'MANAGER') {
    return (
      <div className="w-full bg-[#f5f7fa] min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-white rounded-2xl border border-rose-200 shadow-lg p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[30px]">gpp_maybe</span>
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-headline font-bold text-slate-900">
              ไม่มีสิทธิ์เข้าถึงหน้านี้ (Access Denied)
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              หน้าจัดการผู้ใช้งานและสิทธิ์ระบบสงวนไว้สำหรับผู้ดูแลระดับ{' '}
              <span className="font-mono font-bold text-slate-800">MANAGER</span> เท่านั้น
              {sessionUser ? ` (สิทธิ์ปัจจุบันของคุณคือ ${sessionUser.role})` : ''}
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>กลับไปหน้า Incident Console</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#f5f7fa] min-h-[calc(100vh-4rem)] py-8 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {toast && (
          <div
            className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2 text-xs font-medium ${
              toast.type === 'ok'
                ? 'bg-slate-900 text-white border-sky-500/30'
                : 'bg-rose-950 text-rose-50 border-rose-500/40'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[18px] ${
                toast.type === 'ok' ? 'text-sky-400' : 'text-rose-400'
              }`}
            >
              {toast.type === 'ok' ? 'check_circle' : 'error'}
            </span>
            <span>{toast.text}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-headline font-semibold tracking-tight text-slate-900">
              Users &amp; Roles Management
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              จัดการบัญชีเจ้าหน้าที่ IT (STAFF) และผู้จัดการระบบ (MANAGER) พร้อมกำหนดสิทธิ์การปิดงานและตั้งค่าระบบ
              <span className="ml-2 text-xs text-slate-500 font-mono">
                • Signed in as {sessionUser.name} ({sessionUser.role})
              </span>
            </p>
          </div>
          <Link
            href="/admin"
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Incident Console</span>
          </Link>
        </div>

        {/* Invite via Email Form */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">forward_to_inbox</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">เชิญทีมงานผ่าน Email (Invite Link)</h2>
              <p className="text-[11px] text-slate-500">
                ส่งลิงก์อายุ 48 ชม. (ใช้ได้ 1 ครั้ง) ให้ผู้ถูกเชิญตั้ง Password เพื่อล็อกอินด้วย Email ของตัวเอง
              </p>
            </div>
          </div>

          <form onSubmit={handleSendInvite} className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Email ผู้รับเชิญ *</label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">ชื่อ-นามสกุล *</label>
              <input
                type="text"
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Nattapong S."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Role *</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              >
                <option value="STAFF">STAFF</option>
                <option value="MANAGER">MANAGER</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={inviting}
              className="w-full py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-semibold shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">
                {inviting ? 'sync' : 'send'}
              </span>
              <span>{inviting ? 'กำลังสร้างคำเชิญ...' : 'ส่ง Invite Link'}</span>
            </button>
          </form>

          {generatedInvite && (
            <div className="px-6 pb-5">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] font-semibold flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 ${
                        generatedInvite.emailSent ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {generatedInvite.emailSent ? 'check_circle' : 'info'}
                      </span>
                      <span>{generatedInvite.emailSent ? 'ส่ง Email แล้ว' : 'ยังไม่ได้ส่ง Email อัตโนมัติ'}</span>
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-500">{generatedInvite.message}</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-700 truncate select-all">
                    {generatedInvite.url}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    let ok = false;
                    try {
                      if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(generatedInvite.url);
                        ok = true;
                      }
                    } catch {}
                    if (!ok) {
                      try {
                        const ta = document.createElement('textarea');
                        ta.value = generatedInvite.url;
                        ta.style.position = 'fixed';
                        ta.style.opacity = '0';
                        document.body.appendChild(ta);
                        ta.select();
                        ok = document.execCommand('copy');
                        document.body.removeChild(ta);
                      } catch {}
                    }
                    showToast(
                      ok ? 'ok' : 'err',
                      ok ? 'คัดลอก Invite Link แล้ว' : 'คัดลอกอัตโนมัติไม่สำเร็จ กรุณาคลุมข้อความลิงก์ด้านซ้ายแล้ว Ctrl+C'
                    );
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold shrink-0 cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[15px]">content_copy</span>
                  <span>Copy Link</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Create User Form */}
        <section className="bg-white rounded-2xl border border-sky-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-sky-50/40 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-[18px]">person_add</span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">สร้างบัญชีผู้ใช้งานใหม่ (Create User)</h2>
              <p className="text-[11px] text-slate-500">
                รหัสผ่านจะถูกเข้ารหัสด้วย Node crypto scrypt และสามารถเข้าสู่ระบบได้ที่ /admin/login
              </p>
            </div>
          </div>

          <form onSubmit={handleCreate} className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Email (ใช้ล็อกอิน) *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="somchai@company.com"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">ชื่อ-นามสกุล *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Somchai K."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Role *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600"
              >
                <option value="STAFF">STAFF</option>
                <option value="MANAGER">MANAGER</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Password * (≥4 ตัว)</label>
              <input
                type="password"
                required
                minLength={4}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600"
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full py-2 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white text-xs font-semibold shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">
                {creating ? 'sync' : 'add'}
              </span>
              <span>{creating ? 'กำลังสร้าง...' : 'เพิ่มผู้ใช้งาน'}</span>
            </button>
          </form>
        </section>

        {/* Users Table */}
        <section className="bg-white rounded-2xl border border-sky-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sky-600 text-[20px]">manage_accounts</span>
              <h2 className="text-sm font-bold text-slate-900">รายชื่อผู้ใช้งานทั้งหมด ({users.length})</h2>
            </div>
            <span className="text-[11px] text-slate-500">
              MANAGER: จัดการผู้ใช้/ปิดเคส • STAFF: รับเรื่องและอัปเดตงาน
            </span>
          </div>

          {users.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              ยังไม่มีบัญชีผู้ใช้งานในฐานข้อมูล (สามารถใช้แบบฟอร์มด้านบนเพื่อสร้างบัญชีแรกได้ทันที)
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-medium text-slate-600">
                    <th className="py-3 px-5">Email / บัญชีเข้าใช้</th>
                    <th className="py-3 px-4">ชื่อแสดงผล</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">สถานะ</th>
                    <th className="py-3 px-5 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {users.map((u) => {
                    const isSelf = Boolean(sessionUser?.userId && sessionUser.userId === u.id);
                    const isBusy = busyId === u.id;
                    const showLegacyUsername = Boolean(u.email && u.username.toLowerCase() !== u.email.toLowerCase());
                    return (
                      <tr key={u.id} className="hover:bg-sky-50/30 transition-colors">
                        <td className="py-3.5 px-5 font-mono font-semibold text-slate-900">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{u.email || u.username}</span>
                            {showLegacyUsername && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-mono">
                                @{u.username}
                              </span>
                            )}
                            {isSelf && (
                              <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] font-sans font-bold">
                                คุณ
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-800 font-medium">{u.name}</td>
                        <td className="py-3.5 px-4">
                          <select
                            aria-label={`Role for ${u.username}`}
                            disabled={isSelf || isBusy}
                            value={u.role}
                            onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60 disabled:cursor-not-allowed ${
                              u.role === 'MANAGER'
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                          >
                            <option value="STAFF">STAFF</option>
                            <option value="MANAGER">MANAGER</option>
                          </select>
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            disabled={isSelf || isBusy}
                            onClick={() => handleToggleActive(u)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer ${
                              u.isActive
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                u.isActive ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                            />
                            <span>{u.isActive ? 'Active' : 'Suspended'}</span>
                          </button>
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditModal(u)}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-200 text-slate-700 hover:text-sky-700 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <span className="material-symbols-outlined text-[14px]">edit</span>
                              <span>แก้ไข</span>
                            </button>
                            <button
                              type="button"
                              disabled={isSelf || isBusy}
                              onClick={() => handleDelete(u)}
                              title={isSelf ? 'ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่' : 'ลบผู้ใช้งาน'}
                              className="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                            >
                              <span className="material-symbols-outlined text-[14px]">delete</span>
                              <span>ลบ</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Edit Modal */}
        {editingUser && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    แก้ไขข้อมูลผู้ใช้: <span className="font-mono text-sky-700">{editingUser.username}</span>
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">ชื่อแสดงผล *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">Role</label>
                    <select
                      disabled={Boolean(sessionUser?.userId && sessionUser.userId === editingUser.id)}
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as UserRole)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white disabled:opacity-60"
                    >
                      <option value="STAFF">STAFF</option>
                      <option value="MANAGER">MANAGER</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">สถานะบัญชี</label>
                    <select
                      disabled={Boolean(sessionUser?.userId && sessionUser.userId === editingUser.id)}
                      value={editActive ? 'ACTIVE' : 'INACTIVE'}
                      onChange={(e) => setEditActive(e.target.value === 'ACTIVE')}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white disabled:opacity-60"
                    >
                      <option value="ACTIVE">Active (เปิดใช้งาน)</option>
                      <option value="INACTIVE">Suspended (ระงับ)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    รหัสผ่านใหม่ (เว้นว่างไว้หากไม่ต้องการเปลี่ยน)
                  </label>
                  <input
                    type="password"
                    minLength={4}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="อย่างน้อย 4 ตัวอักษร"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white text-xs font-semibold shadow-sm cursor-pointer"
                  >
                    {savingEdit ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
