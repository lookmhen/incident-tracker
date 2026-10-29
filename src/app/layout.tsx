import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/layout/Navbar';

export const metadata: Metadata = {
  title: 'IncidentHub - IT Incident Management System',
  description: 'Zero-Barrier IT Incident Management System (MCP Ready v1.1 - 100% Offline)',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="bg-[#f0f7ff] text-slate-900 antialiased selection:bg-sky-100 selection:text-sky-900 min-h-screen flex flex-col font-body">
        <Navbar />
        <main className="flex-1 w-full pt-16">{children}</main>
        <footer className="w-full bg-white border-t border-sky-100 py-6">
          <div className="w-full px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="font-semibold text-slate-800">IncidentHub Engine</span>
              <span className="text-slate-300">|</span>
              <span>SQLite • Pure Docker Node 26 Container</span>
              <span className="text-slate-300">|</span>
              <span>Model Context Protocol v2024.11</span>
            </div>
            <div>© 2026 IncidentHub Operations. High-Reliability Incident Response Architecture.</div>
          </div>
        </footer>
      </body>
    </html>
  );
}
