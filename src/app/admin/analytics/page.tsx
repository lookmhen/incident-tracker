'use client';

import { useState, useEffect } from 'react';
import type { RootCauseNode } from '@/components/ManageRootCausesModal';

interface RootCauseGroupedItem {
  parent: string;
  count: number;
  percentage: number;
  children: Array<{ name: string; fullPath: string; count: number; percentage: number }>;
}

interface AnalyticsData {
  summary: {
    total: number;
    resolvedCount: number;
    openCount: number;
    inProgressCount: number;
    onHoldCount?: number;
    criticalCount: number;
    externalUserCount?: number;
    resolutionRate: number;
    avgResolutionMins: number;
  };
  groupBy?: 'day' | 'month' | 'year';
  trend: Array<{ date: string; label?: string; total: number; high: number; resolved: number }>;
  byCategory: Array<{ name: string; count: number; percentage: number; color?: string }>;
  byRootCause?: Array<{ rootCause: string; count: number; percentage: number }>;
  byRootCauseGrouped?: RootCauseGroupedItem[];
  byDepartment: Array<{ department: string; count: number; percentage: number }>;
  byStatus: Array<{ status: string; count: number }>;
  byUrgency: Array<{ urgency: string; count: number }>;
  mttrByUrgency: Array<{ urgency: string; avgMins: number; count: number }>;
  mttrByCategory: Array<{ category: string; avgMins: number; count: number }>;
  backlogAging: Array<{ key: string; label: string; count: number }>;
  filterOptions?: {
    categories: string[];
    rootCauses?: string[];
    rootCauseTree?: RootCauseNode[];
    departments: string[];
  };
}

const COLORS = ['#0284c7', '#0ea5e9', '#38bdf8', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6'];

const formatMins = (mins: number) => {
  if (mins <= 0) return '0 นาที';
  if (mins < 60) return `${mins} นาที`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins > 0 ? `${hours} ชม. ${remMins} น.` : `${hours} ชม.`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days} วัน ${remHours} ชม.` : `${days} วัน`;
};

export default function AnalyticsDashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [groupBy, setGroupBy] = useState<'auto' | 'day' | 'month' | 'year'>('auto');
  const [showAllDepts, setShowAllDepts] = useState(false);
  const [urgencyFilter, setUrgencyFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [rootCauseParentFilter, setRootCauseParentFilter] = useState('ALL');
  const [rootCauseSubFilter, setRootCauseSubFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [externalFilter, setExternalFilter] = useState('ALL');
  // null = custom range from the date inputs
  const [preset, setPreset] = useState<'7' | '30' | 'year' | 'all' | null>('all');
  const currentYear = new Date().getFullYear();

  const getEffectiveRootCause = (parent: string, sub: string) => {
    if (parent === 'ALL' || parent === 'Unspecified') return parent;
    return sub === 'ALL' ? parent : `${parent} > ${sub}`;
  };

  const fetchAnalytics = async (overrides?: {
    startDate?: string;
    endDate?: string;
    groupBy?: 'auto' | 'day' | 'month' | 'year';
    urgency?: string;
    category?: string;
    rootCause?: string;
    department?: string;
    resolvedByExternal?: string;
  }) => {
    setLoading(true);
    try {
      const s = overrides?.startDate !== undefined ? overrides.startDate : startDate;
      const e = overrides?.endDate !== undefined ? overrides.endDate : endDate;
      const g = overrides?.groupBy !== undefined ? overrides.groupBy : groupBy;
      const u = overrides?.urgency !== undefined ? overrides.urgency : urgencyFilter;
      const c = overrides?.category !== undefined ? overrides.category : categoryFilter;
      const rc =
        overrides?.rootCause !== undefined
          ? overrides.rootCause
          : getEffectiveRootCause(rootCauseParentFilter, rootCauseSubFilter);
      const d = overrides?.department !== undefined ? overrides.department : deptFilter;
      const ext = overrides?.resolvedByExternal !== undefined ? overrides.resolvedByExternal : externalFilter;

      const params = new URLSearchParams();
      if (s) params.set('startDate', s);
      if (e) params.set('endDate', e);
      if (g && g !== 'auto') params.set('groupBy', g);
      if (u !== 'ALL') params.set('urgency', u);
      if (c !== 'ALL') params.set('category', c);
      if (rc !== 'ALL') params.set('rootCause', rc);
      if (d !== 'ALL') params.set('department', d);
      if (ext !== 'ALL') params.set('resolvedByExternal', ext);

      const res = await fetch(`/api/incidents/analytics?${params.toString()}`, { cache: 'no-store' });
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
    setGroupBy('auto');
    if (days === null) {
      setPreset('all');
      setStartDate('');
      setEndDate('');
      fetchAnalytics({ startDate: '', endDate: '', groupBy: 'auto' });
      return;
    }
    setPreset(days === 7 ? '7' : '30');
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    // sv-SE formats as YYYY-MM-DD in local time (toISOString is UTC, off by a day in UTC+7)
    const sStr = start.toLocaleDateString('sv-SE');
    const eStr = end.toLocaleDateString('sv-SE');
    setStartDate(sStr);
    setEndDate(eStr);
    fetchAnalytics({ startDate: sStr, endDate: eStr, groupBy: 'auto' });
  };

  const applyYearPreset = (year = currentYear) => {
    setPreset('year');
    const sStr = `${year}-01-01`;
    const eStr = `${year}-12-31`;
    setStartDate(sStr);
    setEndDate(eStr);
    setGroupBy('month');
    fetchAnalytics({ startDate: sStr, endDate: eStr, groupBy: 'month' });
  };

  const presetClass = (p: typeof preset) =>
    `px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
      preset === p
        ? 'bg-sky-600 text-white border-sky-600 font-semibold'
        : 'bg-white hover:bg-sky-50 border-slate-200 text-slate-600'
    }`;

  const getExportUrl = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (urgencyFilter !== 'ALL') params.set('urgency', urgencyFilter);
    if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
    const activeRootCause = getEffectiveRootCause(rootCauseParentFilter, rootCauseSubFilter);
    if (activeRootCause !== 'ALL') params.set('rootCause', activeRootCause);
    if (deptFilter !== 'ALL') params.set('department', deptFilter);
    if (externalFilter !== 'ALL') params.set('resolvedByExternal', externalFilter);
    return `/api/incidents/export?${params.toString()}`;
  };

  const rootCauseTreeOptions: RootCauseNode[] = (() => {
    const tree = data?.filterOptions?.rootCauseTree;
    if (tree && tree.length > 0) return tree;
    const flat = data?.filterOptions?.rootCauses || [];
    const map = new Map<string, string[]>();
    for (const item of flat) {
      const sep = item.indexOf(' > ');
      const parent = sep >= 0 ? item.slice(0, sep).trim() : item.trim();
      const child = sep >= 0 ? item.slice(sep + 3).trim() : '';
      if (!parent || parent === 'Unspecified') continue;
      const children = map.get(parent) || [];
      if (child && !children.includes(child)) children.push(child);
      map.set(parent, children);
    }
    return Array.from(map.entries()).map(([name, children]) => ({ name, children }));
  })();
  const selectedRootCauseNode = rootCauseTreeOptions.find((n) => n.name === rootCauseParentFilter);
  const rootCauseSubOptions = selectedRootCauseNode?.children || [];

  const maxTrend = Math.max(...(data?.trend.map((t) => Math.max(t.total, t.resolved)) || [1]), 1);
  const maxDept = Math.max(...(data?.byDepartment.map((d) => d.count) || [1]), 1);
  const maxMttrCat = Math.max(...(data?.mttrByCategory.map((m) => m.avgMins) || [1]), 1);
  const totalBacklogAging = data?.backlogAging.reduce((acc, b) => acc + b.count, 0) || 0;

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
                onClick={() => {
                  setPreset(null);
                  setGroupBy('auto');
                  fetchAnalytics({ startDate, endDate, groupBy: 'auto' });
                }}
                className="ml-1 px-2.5 py-1 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 cursor-pointer"
              >
                Filter
              </button>
            </div>

            <select
              value={urgencyFilter}
              onChange={(e) => {
                const v = e.target.value;
                setUrgencyFilter(v);
                fetchAnalytics({ urgency: v });
              }}
              aria-label="Filter by urgency"
              className="bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-8 py-1.5 text-xs text-slate-700 font-medium cursor-pointer focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Urgency: All</option>
              <option value="HIGH">P1 - High</option>
              <option value="MEDIUM">P2 - Medium</option>
              <option value="LOW">P3 - Low</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => {
                const v = e.target.value;
                setCategoryFilter(v);
                fetchAnalytics({ category: v });
              }}
              aria-label="Filter by category"
              className="bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-8 py-1.5 text-xs text-slate-700 font-medium cursor-pointer focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Category: All</option>
              {(data?.filterOptions?.categories || []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={rootCauseParentFilter}
              onChange={(e) => {
                const v = e.target.value;
                setRootCauseParentFilter(v);
                setRootCauseSubFilter('ALL');
                fetchAnalytics({ rootCause: getEffectiveRootCause(v, 'ALL') });
              }}
              aria-label="Filter by root cause"
              className="bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-8 py-1.5 text-xs text-slate-700 font-medium cursor-pointer focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Root Cause: All</option>
              {rootCauseTreeOptions.map((node) => (
                <option key={node.name} value={node.name}>
                  {node.name}
                </option>
              ))}
              <option value="Unspecified">Unspecified</option>
            </select>

            {rootCauseParentFilter !== 'ALL' &&
              rootCauseParentFilter !== 'Unspecified' &&
              rootCauseSubOptions.length > 0 && (
                <select
                  value={rootCauseSubFilter}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRootCauseSubFilter(v);
                    fetchAnalytics({ rootCause: getEffectiveRootCause(rootCauseParentFilter, v) });
                  }}
                  aria-label="Filter by root cause sub-branch"
                  className="bg-indigo-50/70 border border-indigo-200 rounded-xl pl-3 pr-8 py-1.5 text-xs text-indigo-800 font-medium cursor-pointer focus:outline-none focus:border-indigo-500"
                >
                  <option value="ALL">Sub: All</option>
                  {rootCauseSubOptions.map((child) => (
                    <option key={child} value={child}>
                      {child}
                    </option>
                  ))}
                </select>
              )}

            <select
              value={deptFilter}
              onChange={(e) => {
                const v = e.target.value;
                setDeptFilter(v);
                fetchAnalytics({ department: v });
              }}
              aria-label="Filter by department"
              className="bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-8 py-1.5 text-xs text-slate-700 font-medium cursor-pointer focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Dept: All</option>
              {(data?.filterOptions?.departments || []).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              value={externalFilter}
              onChange={(e) => {
                const v = e.target.value;
                setExternalFilter(v);
                fetchAnalytics({ resolvedByExternal: v });
              }}
              aria-label="Filter by solver"
              className="bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-8 py-1.5 text-xs text-slate-700 font-medium cursor-pointer focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Solver: All</option>
              <option value="false">IT Team</option>
              <option value="true">External User</option>
            </select>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyPreset(7)}
                aria-pressed={preset === '7'}
                className={presetClass('7')}
              >
                7 วัน
              </button>
              <button
                type="button"
                onClick={() => applyPreset(30)}
                aria-pressed={preset === '30'}
                className={presetClass('30')}
              >
                30 วัน
              </button>
              <button
                type="button"
                onClick={() => applyYearPreset()}
                aria-pressed={preset === 'year'}
                className={presetClass('year')}
                title={`ดูแนวโน้มตลอดทั้งปี ${currentYear} (12 เดือน)`}
              >
                ปีนี้ (12 เดือน)
              </button>
              <button
                type="button"
                onClick={() => applyPreset(null)}
                aria-pressed={preset === 'all'}
                className={presetClass('all')}
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
              {(data?.summary.onHoldCount || 0) > 0 && (
                <>
                  {' '}
                  • On Hold: <strong className="text-violet-700">{data?.summary.onHoldCount}</strong>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-sky-100 shadow-xs">
            <div className="text-xs text-slate-500 font-medium uppercase">Resolution Rate (SLA)</div>
            <div className="text-3xl font-bold text-emerald-600 mt-2">
              {data?.summary.resolutionRate || 0}%
            </div>
            <div className="text-[11px] text-slate-500 mt-2">
              แก้ไขสำเร็จแล้ว {data?.summary.resolvedCount || 0} จาก {data?.summary.total || 0} เคส
              {(data?.summary.externalUserCount || 0) > 0 && (
                <>
                  {' '}
                  • External User: <strong className="text-teal-700">{data?.summary.externalUserCount}</strong>
                </>
              )}
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

        {/* Chart 1: Full-width Trend Over Time */}
        <div className="bg-white rounded-2xl p-6 border border-sky-100 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                1. แนวโน้มเข้าใหม่ vs ปิดแล้ว ({data?.groupBy === 'year' ? 'รายปี' : data?.groupBy === 'month' ? 'รายเดือน' : 'รายวัน'})
              </h2>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-sky-500 inline-block"></span>
                  เข้าใหม่ (Created)
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block"></span>
                  ปิดแล้ว (Resolved)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs self-start sm:self-auto">
              {(
                [
                  { key: 'year', label: 'รายปี' },
                  { key: 'month', label: 'รายเดือน' },
                  { key: 'day', label: 'รายวัน' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setGroupBy(opt.key);
                    fetchAnalytics({ groupBy: opt.key });
                  }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    data?.groupBy === opt.key
                      ? 'bg-white text-sky-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {!data || data.trend.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-slate-400">ไม่มีข้อมูลในช่วงเวลานี้</div>
          ) : (
            <div className="h-56 flex items-end gap-2 pt-6 pb-2 px-2 border-b border-slate-100 overflow-x-auto">
              {data.trend.map((item) => {
                const totalPct = item.total > 0 ? Math.max(Math.round((item.total / maxTrend) * 100), 10) : 0;
                const resolvedPct = item.resolved > 0 ? Math.max(Math.round((item.resolved / maxTrend) * 100), 10) : 0;
                return (
                  <div key={item.date} className="flex-1 min-w-[32px] flex flex-col items-center gap-1.5">
                    <span
                      className={`text-[10px] font-mono font-bold whitespace-nowrap ${
                        item.total > 0 ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      {item.total}/{item.resolved}
                    </span>
                    <div className="w-full max-w-[52px] bg-slate-100/80 rounded-t-lg h-36 flex items-end justify-center gap-0.5 px-0.5 overflow-hidden">
                      {item.total > 0 || item.resolved > 0 ? (
                        <>
                          <div
                            className="flex-1 bg-gradient-to-t from-sky-600 to-sky-400 rounded-t-sm transition-all"
                            style={{ height: `${totalPct}%` }}
                            title={`${item.date}: เข้าใหม่ ${item.total} (${item.high} High)`}
                          />
                          <div
                            className="flex-1 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-sm transition-all"
                            style={{ height: `${resolvedPct}%` }}
                            title={`${item.date}: ปิดแล้ว ${item.resolved}`}
                          />
                        </>
                      ) : (
                        <div className="w-full h-1 bg-slate-200" title={`${item.date}: 0 cases`} />
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 truncate max-w-[56px] text-center" title={item.label || item.date}>
                      {item.label || item.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2-Column Stacked Masonry Grid (prevents empty gap under compact cards like Chart 4) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Column: Chart 2, Chart 3 (collapsible), Chart 6 */}
          <div className="space-y-6">
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
                {!data || data.byCategory.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">ไม่มีข้อมูลในช่วงเวลานี้</div>
                ) : (
                  data.byCategory.map((cat, idx) => {
                    const barColor = cat.color || COLORS[idx % COLORS.length];
                    return (
                      <div key={cat.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-semibold text-slate-800 flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: barColor }}
                            />
                            <span className="truncate">{cat.name}</span>
                          </span>
                          <span className="font-mono text-slate-600 shrink-0">
                            <strong>{cat.count}</strong> เคส ({cat.percentage}%)
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.max(cat.percentage, 4)}%`,
                              backgroundColor: barColor,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Chart 3: Top Departments (Expand / Collapse) */}
            <div className="bg-white rounded-2xl p-6 border border-sky-100 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    3. อันดับแผนกที่แจ้งปัญหามากที่สุด (Top Departments)
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    จัดอันดับตามจำนวนครั้งที่ส่งฟอร์มแจ้งปัญหา
                    {data && data.byDepartment.length > 5 && !showAllDepts ? ` (แสดง 5 จาก ${data.byDepartment.length} แผนก)` : ''}
                  </p>
                </div>
                <span className="material-symbols-outlined text-sky-600 shrink-0">apartment</span>
              </div>

              <div className="space-y-3 pt-2">
                {!data || data.byDepartment.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">ไม่มีข้อมูลในช่วงเวลานี้</div>
                ) : (
                  (showAllDepts ? data.byDepartment : data.byDepartment.slice(0, 5)).map((dept) => {
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
                  })
                )}
              </div>

              {data && data.byDepartment.length > 5 && (
                <div className="pt-2 border-t border-slate-100 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAllDepts((prev) => !prev)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-200 text-xs font-semibold text-slate-700 hover:text-sky-700 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {showAllDepts ? 'expand_less' : 'expand_more'}
                    </span>
                    <span>
                      {showAllDepts ? 'ย่อเหลือ 5 อันดับแรก' : `แสดงทั้งหมด (${data.byDepartment.length} แผนก)`}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Chart 6: Backlog Aging */}
            <div className="bg-white rounded-2xl p-6 border border-sky-100 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    6. อายุเคสที่ยังค้างอยู่ (Backlog Aging)
                  </h2>
                  <p className="text-[11px] text-slate-500">ติดตามระยะเวลาค้างของเคส OPEN และ IN_PROGRESS เพื่อกันเคสตกหล่น</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-mono font-bold">
                  ค้าง {totalBacklogAging} เคส
                </span>
              </div>

              {(data?.summary.onHoldCount || 0) > 0 && (
                <div className="px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-[11px] text-violet-800 flex items-center justify-between">
                  <span>พักรอ Solution (On Hold — แยกออกจากคิวค้าง &amp; MTTR):</span>
                  <strong className="font-mono">{data?.summary.onHoldCount} เคส</strong>
                </div>
              )}

              {totalBacklogAging === 0 ? (
                <div className="py-12 text-center text-xs text-emerald-600 font-medium bg-emerald-50/50 rounded-xl border border-emerald-100">
                  ไม่มีเคสเปิดค้างในช่วงตัวกรองที่เลือก
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  {(data?.backlogAging || []).map((b) => {
                    const pct = totalBacklogAging > 0 ? Math.round((b.count / totalBacklogAging) * 100) : 0;
                    const isOverdue = b.key === 'over_7d' && b.count > 0;
                    return (
                      <div key={b.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-semibold ${isOverdue ? 'text-rose-700' : 'text-slate-700'}`}>
                            {b.label}
                          </span>
                          <span className={`font-mono font-bold ${isOverdue ? 'text-rose-600' : 'text-slate-700'}`}>
                            {b.count} เคส ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isOverdue ? 'bg-rose-500' : b.key === '4_7d' ? 'bg-amber-500' : 'bg-sky-500'
                            }`}
                            style={{ width: `${b.count > 0 ? Math.max(pct, 6) : 0}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Chart 4, Chart 5 (moves directly up under Chart 4) */}
          <div className="space-y-6">
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

            {/* Chart 5: MTTR Breakdown by Urgency & Category */}
            <div className="bg-white rounded-2xl p-6 border border-sky-100 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    5. ความเร็วแก้ไขเฉลี่ยแยกมิติ (MTTR Breakdown)
                  </h2>
                  <p className="text-[11px] text-slate-500">เวลาเฉลี่ยตั้งแต่เปิดเคสจนปิดแยกตามความเร่งด่วนและหมวดหมู่</p>
                </div>
                <span className="material-symbols-outlined text-sky-600">speed</span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center">
                {(data?.mttrByUrgency || []).map((m) => (
                  <div
                    key={m.urgency}
                    className={`p-3 rounded-xl border text-xs ${
                      m.urgency === 'HIGH'
                        ? 'bg-rose-50/70 border-rose-200 text-rose-800'
                        : m.urgency === 'MEDIUM'
                        ? 'bg-amber-50/70 border-amber-200 text-amber-800'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-[11px]">{m.urgency}</div>
                    <div className="text-sm font-mono font-bold mt-1">
                      {m.count > 0 ? formatMins(m.avgMins) : '-'}
                    </div>
                    <div className="text-[10px] opacity-75 mt-0.5">{m.count} เคส</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-700">MTTR รายหมวดหมู่ (เรียงจากช้าสุด)</div>
                {!data || data.mttrByCategory.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">ยังไม่มีข้อมูลปิดเคสที่มีเวลาอ้างอิง</div>
                ) : (
                  data.mttrByCategory.map((c) => {
                    const pct = c.avgMins > 0 ? Math.max(Math.round((c.avgMins / maxMttrCat) * 100), 6) : 4;
                    return (
                      <div key={c.category} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-800">{c.category}</span>
                          <span className="font-mono text-sky-700 font-semibold">
                            {formatMins(c.avgMins)} <span className="text-slate-400 font-normal">({c.count})</span>
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Chart 7: Full-width Root Cause Analysis */}
        <div className="bg-white rounded-2xl p-6 border border-sky-100 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  7. การวิเคราะห์ต้นตอปัญหา (Root Cause Breakdown)
                </h2>
                <p className="text-[11px] text-slate-500">จำแนกสาเหตุต้นตอที่แท้จริง เช่น Human, System, Data</p>
              </div>
              <span className="material-symbols-outlined text-indigo-600">troubleshoot</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
              {data?.byRootCauseGrouped && data.byRootCauseGrouped.length > 0 ? (
                data.byRootCauseGrouped.map((group, idx) => {
                  const barColor =
                    group.parent === 'Unspecified' ? '#94a3b8' : COLORS[(idx + 3) % COLORS.length];
                  return (
                    <div key={group.parent} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-bold text-slate-900 truncate">{group.parent}</span>
                          <span className="font-mono text-indigo-700 font-bold shrink-0">
                            {group.count} เคส ({group.percentage}%)
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.max(group.percentage, 4)}%`,
                              backgroundColor: barColor,
                            }}
                          />
                        </div>
                      </div>

                      {group.children.length > 0 && (
                        <div className="pl-3 border-l-2 border-indigo-200 space-y-2 pt-0.5">
                          {group.children.map((child) => (
                            <div key={child.fullPath} className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] gap-2">
                                <span className="font-medium text-slate-700 truncate">{child.name}</span>
                                <span className="font-mono text-slate-600 shrink-0">
                                  <strong>{child.count}</strong> ({child.percentage}%)
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${child.count > 0 ? Math.max(child.percentage, 4) : 0}%`,
                                    backgroundColor: barColor,
                                    opacity: 0.78,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : !data || !data.byRootCause || data.byRootCause.length === 0 ? (
                <div className="sm:col-span-2 lg:col-span-3 py-8 text-center text-xs text-slate-400">
                  ไม่มีข้อมูลในช่วงเวลานี้
                </div>
              ) : (
                data.byRootCause.map((rc, idx) => (
                  <div key={rc.rootCause} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">{rc.rootCause}</span>
                      <span className="font-mono text-indigo-700 font-bold">
                        {rc.count} เคส ({rc.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(rc.percentage, 4)}%`,
                          backgroundColor: rc.rootCause === 'Unspecified' ? '#94a3b8' : COLORS[(idx + 3) % COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
      </div>
    </div>
  );
}
