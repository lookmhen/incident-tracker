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
    <html lang="th" suppressHydrationWarning>
      <body className="bg-[#f5f7fa] text-slate-900 antialiased selection:bg-sky-100 selection:text-sky-900 min-h-screen flex flex-col font-body">
        <Navbar />
        <main className="flex-1 w-full pt-16">{children}</main>
        <footer className="w-full bg-white border-t border-slate-200 py-5">
          <div className="w-full px-6 lg:px-8 flex items-center justify-center text-xs text-slate-500">
            <div>© 2026 IncidentHub Operations. High-Reliability Incident Response Architecture.</div>
          </div>
        </footer>
      </body>
    </html>
  );
}
