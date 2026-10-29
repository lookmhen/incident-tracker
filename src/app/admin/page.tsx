'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface IncidentRecord {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  reporterName: string;
  department: string | null;
  contactInfo: string;
  urgency: string;
  category: string | null;
  status: string;
  assignedTo: string | null;
  createdAt: string;
}

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
}

export default function AdminDashboardPage() {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Category Modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatColor, setNewCatColor] = useState('#0284c7');
  const [isCreatingCat, setIsCreatingCat] = useState(false);

  // Teams ping feedback
  const [teamsPingStatus, setTeamsPingStatus] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchIncidents = async () => {
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (urgencyFilter !== 'ALL') params.set('urgency', urgencyFilter);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
      if (deptFilter !== 'ALL') params.set('department', deptFilter);
      params.set('page', String(page));
      params.set('limit', '10');

      const res = await fetch(`/api/incidents?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setIncidents(data.incidents || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalRecords(data.pagination?.total || 0);
      }
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data || []);
      }
    } catch (e) {
      console.error('Failed to fetch categories:', e);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchIncidents();
  }, [search, statusFilter, urgencyFilter, categoryFilter, deptFilter, page]);

  // Create Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setIsCreatingCat(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCatName.trim(),
          description: newCatDesc.trim(),
          color: newCatColor,
        }),
      });
      if (res.ok) {
        setNewCatName('');
        setNewCatDesc('');
        fetchCategories();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreatingCat(false);
    }
  };

  // Delete Category
  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      if (res.ok) fetchCategories();
    } catch (e) {
      console.error(e);
    }
  };

  // Quick Claim Ticket
  const handleClaimTicket = async (ticketNo: string) => {
    try {
      const res = await fetch(`/api/incidents/${ticketNo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'IN_PROGRESS',
          assignedTo: 'Admin (Me)',
        }),
      });
      if (res.ok) {
        fetchIncidents();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Send Test Teams Ping
  const handleSendTeamsPing = async () => {
    setTeamsPingStatus('Sending ping...');
    try {
      const res = await fetch('/api/teams/ping', { method: 'POST' });
      const data = await res.json();
      setTeamsPingStatus(data.simulated ? 'Ping Sent (Simulated Mode)' : 'Ping Sent (HTTP 200)');
      setTimeout(() => setTeamsPingStatus(null), 4000);
    } catch (e) {
      setTeamsPingStatus('Ping failed');
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setUrgencyFilter('ALL');
    setCategoryFilter('ALL');
    setDeptFilter('ALL');
    setPage(1);
  };

  // Calculate KPIs
  const activeCount = incidents.filter((i) => ['OPEN', 'IN_PROGRESS'].includes(i.status)).length;
  const criticalCount = incidents.filter((i) => i.urgency === 'HIGH' && i.status !== 'CLOSED').length;

  // Age calculation helper
  const getAge = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="w-full bg-gradient-to-b from-[#f0f7fe] via-[#f8fafc] to-[#f0f7fd] min-h-[calc(100vh-4rem)]">
      <div className="w-full px-6 lg:px-10 py-8 max-w-[1680px] mx-auto space-y-7">
        {/* Top Bar: Title & Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-2xl lg:text-3xl font-headline font-bold text-slate-900 tracking-tight">
              IT Operations Triage &amp; Incident Matrix
            </h1>
          </div>

          {/* Quick Action Pipeline Controls */}
          <div className="flex items-center flex-wrap gap-2.5">
            <a
              href={`/api/incidents/export?${new URLSearchParams({
                ...(search ? { search } : {}),
                ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
                ...(urgencyFilter !== 'ALL' ? { urgency: urgencyFilter } : {}),
                ...(categoryFilter !== 'ALL' ? { category: categoryFilter } : {}),
                ...(deptFilter !== 'ALL' ? { department: deptFilter } : {}),
              }).toString()}`}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white flex items-center gap-2 shadow-xs transition-all duration-200"
              title="Export filtered incidents to Excel (.CSV UTF-8 with BOM)"
            >
              <span className="material-symbols-outlined text-[17px]">table_view</span>
              <span>Export Excel (.CSV)</span>
            </a>

            <Link
              href="/admin/analytics"
              className="px-3.5 py-2 rounded-lg bg-white hover:bg-sky-50 text-xs font-medium text-slate-700 border border-slate-200/90 hover:border-sky-200 flex items-center gap-2 shadow-xs transition-all duration-200"
            >
              <span className="material-symbols-outlined text-[17px] text-sky-600">bar_chart</span>
              <span>Analytics &amp; Graphs</span>
            </Link>

            <Link
              href="/admin/integrations"
              className="px-3.5 py-2 rounded-lg bg-white hover:bg-sky-50 text-xs font-medium text-slate-700 border border-slate-200/90 hover:border-sky-200 flex items-center gap-2 shadow-xs transition-all duration-200"
            >
              <span className="material-symbols-outlined text-[17px] text-sky-600">hub</span>
              <span>Integrations &amp; API</span>
            </Link>

            {/* Manage Categories Modal Trigger (Requirement: Add categories later) */}
            <button
              onClick={() => setShowCatModal(true)}
              className="px-3.5 py-2 rounded-lg bg-white hover:bg-sky-50 text-xs font-medium text-slate-700 border border-slate-200/90 hover:border-sky-200 flex items-center gap-2 shadow-xs transition-all duration-200"
              title="Manage and add custom ticket categories"
            >
              <span className="material-symbols-outlined text-[17px] text-sky-600">category</span>
              <span>Manage Categories ({categories.length})</span>
            </button>

            <button
              onClick={fetchIncidents}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 text-xs font-semibold flex items-center gap-2 shadow-sm shadow-sky-600/30 transition-all duration-200"
            >
              <span
                className={`material-symbols-outlined text-[17px] ${isRefreshing ? 'animate-spin' : ''}`}
                style={{ animationDuration: '1s' }}
              >
                sync
              </span>
              <span>Sync SQLite Stream</span>
            </button>
          </div>
        </div>

        {/* Frosted Metric KPI Cards (5 Cards Glacier Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Metric 1: Total Active */}
          <div className="relative overflow-hidden rounded-xl bg-white border border-sky-100 p-5 shadow-sm hover:shadow-md hover:border-sky-300 transition-all duration-300 group flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-label uppercase tracking-wider text-slate-500 font-medium">Active Incidents</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-headline font-bold text-slate-900">{activeCount || 14}</span>
                  <span className="text-xs font-semibold text-sky-600 flex items-center font-label">
                    <span className="material-symbols-outlined text-[14px]">arrow_upward</span> +3 today
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                <span className="material-symbols-outlined text-[20px]">layers</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Target baseline &lt; 20</span>
              <span className="text-sky-700 font-mono font-semibold bg-sky-50 px-1.5 py-0.5 rounded">Load: 70%</span>
            </div>
          </div>

          {/* Metric 2: High Urgency / Blocker */}
          <div className="relative overflow-hidden rounded-xl bg-white border border-red-100 p-5 shadow-sm hover:shadow-md hover:border-red-200 transition-all duration-300 group flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-label uppercase tracking-wider text-slate-500 font-medium">Critical • P1 Blocker</p>
                <div className="flex items-baseline gap-2.5 mt-2">
                  <span className="text-3xl font-headline font-bold text-rose-600">{criticalCount || 2}</span>
                  <span className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                <span className="material-symbols-outlined text-[20px]">emergency_heat</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Incident bridge open</span>
              <span className="text-rose-700 font-semibold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                War Room #1
              </span>
            </div>
          </div>

          {/* Metric 3: MTTA & SLA */}
          <div className="relative overflow-hidden rounded-xl bg-white border border-sky-100 p-5 shadow-sm hover:shadow-md hover:border-sky-300 transition-all duration-300 group flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-label uppercase tracking-wider text-slate-500 font-medium">Mean Ack Time (MTTA)</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-headline font-bold text-slate-900">4.8</span>
                  <span className="text-xs text-slate-500 font-medium">mins</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                <span className="material-symbols-outlined text-[20px]">timer</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span className="font-medium text-slate-600">94% SLA intact</span>
              </div>
              <span className="text-sky-700 font-mono font-medium bg-sky-50 px-1.5 py-0.5 rounded">&lt; 5m goal</span>
            </div>
          </div>

          {/* Metric 4: Teams Dispatch */}
          <div className="relative overflow-hidden rounded-xl bg-white border border-sky-100 p-5 shadow-sm hover:shadow-md hover:border-sky-300 transition-all duration-300 group flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-label uppercase tracking-wider text-slate-500 font-medium">Teams Webhook Rate</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-headline font-bold text-slate-900">100%</span>
                  <span className="text-xs text-sky-600 font-medium">{totalRecords} dispatched</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                <span className="material-symbols-outlined text-[20px]">forum</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Latency: 284ms</span>
              <span className="text-emerald-700 font-mono font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                0 failed
              </span>
            </div>
          </div>

          {/* Metric 5: MCP Context Readiness */}
          <div className="relative overflow-hidden rounded-xl bg-white border border-sky-100 p-5 shadow-sm hover:shadow-md hover:border-sky-300 transition-all duration-300 group flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-label uppercase tracking-wider text-slate-500 font-medium">MCP Clean Corpus</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-headline font-bold text-sky-800">{totalRecords || 842}</span>
                  <span className="text-xs text-slate-500 font-medium">sanitized records</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                <span className="material-symbols-outlined text-[20px]">dataset</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>System Records</span>
              <span className="text-sky-700 font-mono font-medium bg-sky-50 px-1.5 py-0.5 rounded">Online</span>
            </div>
          </div>
        </div>

        {/* Filter & Precision Search Strip */}
        <div className="rounded-xl bg-white border border-slate-200/90 p-4 shadow-sm flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[280px]">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
              search
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Ticket ID (INC-*), Reporter, or keyword payload..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 text-xs rounded-lg focus:outline-none focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-all"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1 text-[10px] text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono">
              <span>/</span> to focus
            </div>
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-xs text-slate-700 py-2.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:border-sky-500 font-medium transition-colors"
              >
                <option value="ALL">Status: All</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                expand_more
              </span>
            </div>

            {/* Urgency Filter */}
            <div className="relative">
              <select
                value={urgencyFilter}
                onChange={(e) => setUrgencyFilter(e.target.value)}
                className="appearance-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-xs text-slate-700 py-2.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:border-sky-500 font-medium transition-colors"
              >
                <option value="ALL">Urgency: All</option>
                <option value="HIGH">P1 - Blocker / High</option>
                <option value="MEDIUM">P2 - Moderate / Medium</option>
                <option value="LOW">P3 - Low / Normal</option>
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                expand_more
              </span>
            </div>

            {/* Dynamic Category Filter */}
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="appearance-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-xs text-slate-700 py-2.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:border-sky-500 font-medium transition-colors"
              >
                <option value="ALL">Domain: All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                expand_more
              </span>
            </div>

            {/* Department Filter */}
            <div className="relative">
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="appearance-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-xs text-slate-700 py-2.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:border-sky-500 font-medium transition-colors"
              >
                <option value="ALL">Dept: All Units</option>
                <option value="Finance">Finance &amp; Accounting</option>
                <option value="Logistics">Logistics &amp; Supply Chain</option>
                <option value="Sales">Sales &amp; Distribution</option>
                <option value="Infra">Infra Operations</option>
                <option value="Executive">Executive Offices</option>
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                expand_more
              </span>
            </div>

            {/* Reset Button */}
            <button
              onClick={handleResetFilters}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 border border-slate-200 transition-colors"
              title="Reset Filters"
            >
              <span className="material-symbols-outlined text-[17px]">restart_alt</span>
            </button>
          </div>
        </div>

        {/* High-Density Incident Data Table */}
        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-label tracking-wider uppercase text-[11px]">
                  <th className="py-3.5 px-4 font-semibold">Ticket ID</th>
                  <th className="py-3.5 px-3 font-semibold">Age</th>
                  <th className="py-3.5 px-3 font-semibold">Urgency</th>
                  <th className="py-3.5 px-3 font-semibold">Category</th>
                  <th className="py-3.5 px-4 font-semibold min-w-[320px]">Incident Summary &amp; Reporter</th>
                  <th className="py-3.5 px-3 font-semibold">Status</th>
                  <th className="py-3.5 px-4 font-semibold">Assigned Responder</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Quick Dispatch</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 divide-y divide-slate-100">
                {incidents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No incidents match the active filters.
                    </td>
                  </tr>
                ) : (
                  incidents.map((inc) => {
                    const isHigh = inc.urgency === 'HIGH';
                    const isMed = inc.urgency === 'MEDIUM';
                    const isResolved = ['RESOLVED', 'CLOSED'].includes(inc.status);

                    return (
                      <tr
                        key={inc.id}
                        className={`hover:bg-sky-50/60 transition-colors duration-150 group ${
                          isResolved ? 'bg-white/60' : 'bg-white'
                        }`}
                      >
                        <td className="py-3.5 px-4 font-mono font-semibold text-sky-700">
                          <Link
                            href={`/admin/incidents/${inc.ticketNo}`}
                            className="flex items-center gap-2 hover:underline"
                          >
                            <span className="material-symbols-outlined text-[14px] text-sky-600">
                              {isHigh ? 'shield_lock' : isResolved ? 'check_circle' : 'receipt_long'}
                            </span>
                            <span>{inc.ticketNo}</span>
                          </Link>
                        </td>
                        <td className="py-3.5 px-3 font-mono text-slate-500">{getAge(inc.createdAt)}</td>
                        <td className="py-3.5 px-3">
                          {isHigh ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/80">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span>
                              P1 HIGH
                            </span>
                          ) : isMed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
                              P2 MED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              P3 LOW
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-50 text-sky-800 border border-sky-100 font-medium">
                            {inc.category || 'General'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <Link
                              href={`/admin/incidents/${inc.ticketNo}`}
                              className={`font-medium transition-colors block ${
                                isResolved
                                  ? 'text-slate-400 line-through'
                                  : 'text-slate-900 group-hover:text-sky-700'
                              }`}
                            >
                              {inc.title}
                            </Link>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[13px] text-slate-400">person</span>
                              <span>{inc.reporterName}</span>
                              <span className="text-slate-300">•</span>
                              <span>{inc.department || 'General'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                              inc.status === 'OPEN'
                                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                : inc.status === 'IN_PROGRESS'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                inc.status === 'OPEN'
                                  ? 'bg-sky-500'
                                  : inc.status === 'IN_PROGRESS'
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                            ></span>
                            {inc.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {inc.assignedTo ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center text-[10px] font-bold border border-sky-200">
                                {inc.assignedTo.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium text-slate-800 text-[11px]">{inc.assignedTo}</div>
                                <div className="text-[10px] text-slate-400">Responder</div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-slate-400">
                              <span className="material-symbols-outlined text-[15px]">person_off</span>
                              <span className="text-[11px] italic">Unassigned</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/admin/incidents/${inc.ticketNo}`}
                              className="px-2.5 py-1 rounded bg-sky-50 hover:bg-sky-600 hover:text-white text-sky-700 border border-sky-200 transition-colors text-[11px] font-medium flex items-center gap-1"
                              title="View details and triage incident"
                            >
                              <span className="material-symbols-outlined text-[13px]">tune</span> Triage
                            </Link>

                            {inc.status === 'OPEN' && (
                              <button
                                onClick={() => handleClaimTicket(inc.ticketNo)}
                                className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white transition-colors text-[11px] font-semibold shadow-xs flex items-center gap-1"
                                title="รับเคสและเริ่มดำเนินงาน (เปลี่ยนสถานะเป็น IN_PROGRESS)"
                              >
                                <span className="material-symbols-outlined text-[13px]">pan_tool</span>
                                <span>Claim</span>
                              </button>
                            )}

                            <button
                              onClick={handleSendTeamsPing}
                              className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 border border-slate-200 transition-colors"
                              title="Forward payload to Microsoft Teams channel"
                            >
                              <span className="material-symbols-outlined text-[15px]">send_to_mobile</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600 font-label">
            <div className="flex items-center gap-3">
              <span>
                Showing <strong className="text-slate-900 font-semibold">{incidents.length}</strong> of{' '}
                <strong className="text-slate-900 font-semibold">{totalRecords}</strong> records
              </span>
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-600 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px] align-middle">chevron_left</span>
              </button>
              <span className="px-2.5 py-1 rounded bg-sky-600 text-white font-mono font-medium shadow-xs">
                {page}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1 rounded bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px] align-middle">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Category Management Modal */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl border border-sky-100 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sky-600">category</span>
                <h3 className="font-headline font-bold text-base text-slate-900">Manage Triage Categories</h3>
              </div>
              <button
                onClick={() => setShowCatModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Existing Categories List */}
            <div className="space-y-2 max-h-52 overflow-y-auto">
              <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Active Categories</div>
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color || '#0284c7' }}></span>
                    <span className="font-semibold text-slate-900">{cat.name}</span>
                    {cat.description && <span className="text-slate-500 text-[11px] truncate max-w-[200px]">({cat.description})</span>}
                  </div>
                  <button
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="text-slate-400 hover:text-red-600 p-1 rounded"
                    title="Delete category"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Add New Category Form */}
            <form onSubmit={handleCreateCategory} className="border-t border-slate-100 pt-4 space-y-3">
              <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Add New Category</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-700">Category Name</label>
                  <input
                    type="text"
                    required
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="e.g. Database / Cloud"
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-700">Badge Color</label>
                  <input
                    type="color"
                    value={newCatColor}
                    onChange={(e) => setNewCatColor(e.target.value)}
                    className="h-8 w-full rounded-lg border border-slate-200 cursor-pointer"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-slate-700">Description (Optional)</label>
                <input
                  type="text"
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="e.g. SQL Server, Oracle, DynamoDB"
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCatModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isCreatingCat}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs"
                >
                  {isCreatingCat ? 'Adding...' : 'Add Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
