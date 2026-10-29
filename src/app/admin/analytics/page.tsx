'use client';

import { useState, useEffect } from 'react';

interface AnalyticsData {
  summary: {
    total: number;
    resolvedCount: number;
    openCount: number;
    inProgressCount: number;
    criticalCount: number;
    resolutionRate: number;
    avgResolutionMins: number;
  };
  trend: Array<{ date: string; total: number; high: number; resolved: number }>;
  byCategory: Array<{ name: string; count: number; percentage: number }>;
  byDepartment: Array<{ department: string; count: number; percentage: number }>;
  byStatus: Array<{ status: string; count: number }>;
  byUrgency: Array<{ urgency: string; count: number }>;
}

const COLORS = ['#0284c7', '#0ea5e9', '#38bdf8', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function AnalyticsDashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchAnalytics = async (start = startDate, end = endDate) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (start) params.set('startDate', start);
      if (end) params.set('endDate', end);

      const res = await fetch(`/api/incidents/analytics?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const applyPreset = (days: number | null) => {
    if (days === null) {
      setStartDate('');
      setEndDate('');
      fetchAnalytics('', '');
      return;
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    const sStr = start.toISOString().slice(0, 10);
    const eStr = end.toISOString().slice(0, 10);
    setStartDate(sStr);
    setEndDate(eStr);
    fetchAnalytics(sStr, eStr);
  };

  const getExportUrl = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return `/api/incidents/export?${params.toString()}`;
  };

  const maxTrend = Math.max(...(data?.trend.map((t) => t.total) || [1]), 1);
  const maxDept = Math.max(...(data?.byDepartment.map((d) => d.count) || [1]), 1);

  return (
    <div className="w-full bg-gradient-to-b from-[#f0f7fe] via-[#f8fafc] to-[#f0f7fd] min-h-[calc(100vh-4rem)] py-8 px-4 sm:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Bar & Date Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-sky-100 shadow-xs">
          <div>
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-full">
              Executive Operations Report
            </span>
            <h1 className="text-2xl font-headline font-bold text-slate-900 mt-1">
              IT Incident Analytics &amp; SLA Metrics
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
              <span className="text-slate-500 font-medium">ตั้งแต่:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent border-0 p-0 text-xs font-mono focus:ring-0"
              />
              <span className="text-slate-400">-</span>
              <span className="text-slate-500 font-medium">ถึง:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent border-0 p-0 text-xs font-mono focus:ring-0"
              />
              <button
                type="button"
                onClick={() => fetchAnalytics(startDate, endDate)}
                className="ml-1 px-2.5 py-1 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 cursor-pointer"
              >
                กรอง
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyPreset(7)}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-sky-50 border border-slate-200 text-xs text-slate-600 font-medium cursor-pointer"
              >
                7 วัน
              </button>
              <button
                type="button"
                onClick={() => applyPreset(30)}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-sky-50 border border-slate-200 text-xs text-slate-600 font-medium cursor-pointer"
              >
                30 วัน
              </button>
              <button
                type="button"
                onClick={() => applyPreset(null)}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-sky-50 border border-slate-200 text-xs text-slate-600 font-medium cursor-pointer"
              >
                ทั้งหมด
              </button>
            </div>

            <a
              href={getExportUrl()}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <span className="material-symbols-outlined text-[17px]">table_view</span>
              <span>Export Excel (.CSV)</span>
            </a>
          </div>
        </div>

        {/* 4 Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-sky-100 shadow-xs">
            <div className="text-xs text-slate-500 font-medium uppercase">Total Incidents</div>
            <div className="text-3xl font-bold text-slate-900 mt-2">{data?.summary.total || 0}</div>
            <div className="text-[11px] text-slate-500 mt-2">
              Open: <strong className="text-sky-700">{data?.summary.openCount || 0}</strong> • In Progress:{' '}
              <strong className="text-amber-600">{data?.summary.inProgressCount || 0}</strong>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-sky-100 shadow-xs">
            <div className="text-xs text-slate-500 font-medium uppercase">Resolution Rate (SLA)</div>
            <div className="text-3xl font-bold text-emerald-600 mt-2">
              {data?.summary.resolutionRate || 0}%
            </div>
            <div className="text-[11px] text-slate-500 mt-2">
              แก้ไขสำเร็จแล้ว {data?.summary.resolvedCount || 0} จาก {data?.summary.total || 0} เคส
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-sky-100 shadow-xs">
            <div className="text-xs text-slate-500 font-medium uppercase">Critical • High Urgency</div>
            <div className="text-3xl font-bold text-rose-600 mt-2">{data?.summary.criticalCount || 0}</div>
            <div className="text-[11px] text-slate-500 mt-2">เคสเร่งด่วนระดับ P1 Blocker</div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-sky-100 shadow-xs">
            <div className="text-xs text-slate-500 font-medium uppercase">Avg Resolution Time (MTTR)</div>
            <div className="text-3xl font-bold text-sky-700 mt-2">
              {data?.summary.avgResolutionMins || 0} <span className="text-sm font-normal">mins</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-2">ค่าเฉลี่ยเวลาตั้งแต่รับแจ้งจนปิดเคส</div>
          </div>
        </div>

        {/* 4 Main Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Trend Over Time */}
          <div className="bg-white rounded-2xl p-6 border border-sky-100 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">1. ปริมาณเคสรายวันตามเวลา (Trend Over Time)</h2>
                <p className="text-[11px] text-slate-500">เปรียบเทียบจำนวนเคสทั้งหมดและเคสเร่งด่วนรายวัน</p>
              </div>
              <span className="material-symbols-outlined text-sky-600">trending_up</span>
            </div>

            {!data || data.trend.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-xs text-slate-400">ไม่มีข้อมูลในช่วงเวลานี้</div>
            ) : (
              <div className="h-56 flex items-end gap-3 pt-6 pb-2 px-2 border-b border-slate-100 overflow-x-auto">
                {data.trend.map((item) => {
                  const heightPct = Math.max(Math.round((item.total / maxTrend) * 100), 10);
                  return (
                    <div key={item.date} className="flex-1 min-w-[44px] flex flex-col items-center gap-1.5">
                      <span className="text-[11px] font-mono font-bold text-sky-700">{item.total}</span>
                      <div className="w-full max-w-[36px] bg-slate-100 rounded-t-lg h-36 flex items-end overflow-hidden">
                        <div
                          className="w-full bg-gradient-to-t from-sky-600 to-sky-400 rounded-t-lg transition-all"
                          style={{ height: `${heightPct}%` }}
                          title={`${item.date}: ${item.total} cases (${item.high} High)`}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">{item.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chart 2: Category Distribution */}
          <div className="bg-white rounded-2xl p-6 border border-sky-100 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">2. สัดส่วนปัญหาแยกตามหมวดหมู่ (By Category)</h2>
                <p className="text-[11px] text-slate-500">วิเคราะห์หมวดหมู่ระบบที่มีการแจ้งปัญหามากที่สุด</p>
              </div>
              <span className="material-symbols-outlined text-sky-600">pie_chart</span>
            </div>

            <div className="space-y-3 pt-2">
              {data?.byCategory.map((cat, idx) => (
                <div key={cat.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      {cat.name}
                    </span>
                    <span className="font-mono text-slate-600">
                      <strong>{cat.count}</strong> เคส ({cat.percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(cat.percentage, 4)}%`,
                        backgroundColor: COLORS[idx % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chart 3: Top Departments */}
          <div className="bg-white rounded-2xl p-6 border border-sky-100 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  3. อันดับแผนกที่แจ้งปัญหามากที่สุด (Top Departments)
                </h2>
                <p className="text-[11px] text-slate-500">จัดอันดับตามจำนวนครั้งที่ส่งฟอร์มแจ้งปัญหา</p>
              </div>
              <span className="material-symbols-outlined text-sky-600">apartment</span>
            </div>

            <div className="space-y-3 pt-2">
              {data?.byDepartment.map((dept) => {
                const widthPct = Math.max(Math.round((dept.count / maxDept) * 100), 6);
                return (
                  <div key={dept.department} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">{dept.department}</span>
                      <span className="font-mono text-sky-700 font-bold">
                        {dept.count} เคส ({dept.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart 4: Resolution Efficiency & Status Breakdown */}
          <div className="bg-white rounded-2xl p-6 border border-sky-100 shadow-xs space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  4. ประสิทธิภาพการแก้ไขและสถานะเคส (Resolution &amp; SLA Status)
                </h2>
                <p className="text-[11px] text-slate-500">สัดส่วนสถานะการดำเนินงานและระดับความรุนแรง</p>
              </div>
              <span className="material-symbols-outlined text-sky-600">task_alt</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {data?.byStatus.map((st) => (
                <div key={st.status} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">{st.status}</span>
                  <span className="text-lg font-mono font-bold text-sky-700">{st.count}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="text-xs font-semibold text-slate-700">สัดส่วนตามระดับความเร่งด่วน (Urgency Mix)</div>
              <div className="grid grid-cols-3 gap-2.5 text-center">
                {data?.byUrgency.map((u) => (
                  <div
                    key={u.urgency}
                    className={`p-2.5 rounded-xl border text-xs ${
                      u.urgency === 'HIGH'
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : u.urgency === 'MEDIUM'
                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    }`}
                  >
                    <div className="font-bold">{u.urgency}</div>
                    <div className="text-base font-mono font-bold mt-0.5">{u.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
