import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6 bg-slate-50">
      <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center max-w-md space-y-4">
        <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-[28px]">search_off</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 font-headline">404 - ไม่พบหน้าที่ต้องการ</h1>
        <p className="text-xs text-slate-500">หน้าที่คุณพยายามเข้าถึงอาจถูกย้าย ลบ หรือไม่มีอยู่ในระบบ IncidentHub</p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">home</span>
          <span>กลับหน้าแรก</span>
        </Link>
      </div>
    </div>
  );
}
