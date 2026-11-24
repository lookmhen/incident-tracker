'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import type { AdminSession } from '@/lib/auth';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<AdminSession | null>(null);
  const [failedCount, setFailedCount] = useState(0);

  const refreshAuthAndAlerts = () => {
    fetch('/api/auth/admin', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const authed = Boolean(d.authenticated);
        setIsAdmin(authed);
        setUser(authed ? d.user || null : null);
        setFailedCount(Number(d.failedNotifications) || 0);
      })
      .catch(() => {
        setIsAdmin(false);
        setUser(null);
        setFailedCount(0);
      });
  };

  useEffect(() => {
    refreshAuthAndAlerts();
  }, [pathname]);

  useEffect(() => {
    window.addEventListener('integrations-logs-updated', refreshAuthAndAlerts);
    return () => window.removeEventListener('integrations-logs-updated', refreshAuthAndAlerts);
  }, []);

  const navItems = [
    { label: 'Report Incident', href: '/', icon: 'add_circle' },
    { label: 'Incident Console', href: '/admin', icon: 'dashboard' },
    { label: 'Analytics & Graphs', href: '/admin/analytics', icon: 'bar_chart' },
    { label: 'Integrations & Security', href: '/admin/integrations', icon: 'hub' },
    ...(user?.role === 'MANAGER'
      ? [{ label: 'Users & Roles', href: '/admin/users', icon: 'manage_accounts' }]
      : []),
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/admin') return pathname === '/admin' || pathname.startsWith('/admin/incidents');
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/admin', { method: 'DELETE' });
    setIsAdmin(false);
    setUser(null);
    router.push('/');
    router.refresh();
  };

  return (
    <header className="fixed top-0 left-0 right-0 w-full z-50 bg-white border-b border-slate-200 shadow-2xs">
      <div className="h-16 w-full px-6 lg:px-8 flex items-center justify-between gap-6">
        {/* Brand & Desktop Navigation */}
        <div className="flex items-center gap-6 shrink-0">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-[18px]">shield_with_heart</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-headline font-semibold text-base tracking-tight text-slate-900 group-hover:text-sky-700 transition-colors">
                IncidentHub
              </span>
            </div>
          </Link>

          {/* Show Admin Navigation ONLY when authenticated as Admin */}
          {isAdmin && (
            <nav className="hidden xl:flex items-center gap-1.5">
              {navItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                      active
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                    <span>{item.label}</span>
                    {item.href === '/admin/integrations' && failedCount > 0 && (
                      <span
                        className="ml-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold bg-rose-600 text-white leading-none"
                        title={`${failedCount} failed webhook/email notification(s)`}
                      >
                        {failedCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {/* Right Side Controls */}
        <div className="flex items-center gap-3 shrink-0">
          {isAdmin ? (
            <>
              <div className="hidden md:flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                  <span>{`${user?.name || 'Admin'} (${user?.role || 'MANAGER'})`}</span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Sign out of Admin Console"
              >
                <span className="material-symbols-outlined text-[16px]">logout</span>
                <span>Logout</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/track"
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  pathname.startsWith('/track')
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title="ติดตามสถานะการแจ้งปัญหาด้วย Ticket ID"
              >
                <span className="material-symbols-outlined text-[16px]">search_check</span>
                <span>ติดตามสถานะ</span>
              </Link>
              <Link
                href="/admin"
                className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Sign in to IT Operations & Admin Console"
              >
                <span className="material-symbols-outlined text-[16px] text-slate-500">lock</span>
                <span>IT Admin Console</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Nav strip (Only shown when Admin is authenticated) */}
      {isAdmin && (
        <div className="xl:hidden flex items-center justify-around border-t border-slate-100 bg-white/95 px-3 py-1.5 overflow-x-auto">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors flex items-center gap-1 ${
                  active ? 'bg-sky-600 text-white' : 'text-slate-600 hover:text-sky-700'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
