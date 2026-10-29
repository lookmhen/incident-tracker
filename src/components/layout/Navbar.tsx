'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/auth/admin')
      .then((r) => r.json())
      .then((d) => setIsAdmin(Boolean(d.authenticated)))
      .catch(() => setIsAdmin(false));
  }, [pathname]);

  const navItems = [
    { label: 'Report Incident', href: '/', icon: 'add_circle' },
    { label: 'Operations Triage', href: '/admin', icon: 'dashboard' },
    { label: 'Analytics & Graphs', href: '/admin/analytics', icon: 'bar_chart' },
    { label: 'Integrations & Security', href: '/admin/integrations', icon: 'hub' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/admin') return pathname === '/admin' || pathname.startsWith('/admin/incidents');
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/admin', { method: 'DELETE' });
    setIsAdmin(false);
    router.push('/');
    router.refresh();
  };

  return (
    <header className="fixed top-0 left-0 right-0 w-full z-50 bg-white/95 backdrop-blur-xl border-b border-sky-100 shadow-[0_2px_12px_rgba(2,132,199,0.06)]">
      <div className="h-16 w-full px-6 lg:px-8 flex items-center justify-between gap-6">
        {/* Brand & Desktop Navigation */}
        <div className="flex items-center gap-6 shrink-0">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white shadow-sm shadow-sky-600/30">
              <span className="material-symbols-outlined text-[20px]">shield_with_heart</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-headline font-bold text-base tracking-tight text-slate-900 group-hover:text-sky-600 transition-colors">
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
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                      active
                        ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/20'
                        : 'text-slate-600 hover:text-sky-700 hover:bg-sky-50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">{item.icon}</span>
                    <span>{item.label}</span>
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
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Admin Session Active</span>
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
            <Link
              href="/admin"
              className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-sky-50 text-slate-600 hover:text-sky-700 border border-slate-200 hover:border-sky-200 text-xs font-medium flex items-center gap-1.5 transition-all"
              title="Sign in to IT Operations & Admin Console"
            >
              <span className="material-symbols-outlined text-[15px] text-sky-600">lock</span>
              <span>IT Admin Console</span>
            </Link>
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
