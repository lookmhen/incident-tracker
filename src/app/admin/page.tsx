'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import ManageRootCausesModal, {
  DEFAULT_ROOT_CAUSE_TREE,
  type RootCauseNode,
} from '@/components/ManageRootCausesModal';

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
  categoryId?: string | null;
  categoryRel?: { id: string; name: string; color: string | null } | null;
  rootCause?: string | null;
  status: string;
  assignedTo: string | null;
  resolutionType?: string | null;
  workaroundNote?: string | null;
  resolvedByExternal?: boolean;
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

interface DashboardKpis {
  totalRecords: number;
  activeCount: number;
  criticalP1Count: number;
  todayCount: number;
  resolvedCount: number;
  slaRate: number;
  avgResolutionMins: number;
  teamsSent: number;
  teamsFailed: number;
  teamsSuccessRate: number;
}

export default function AdminDashboardPage() {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<DashboardKpis>({
    totalRecords: 0,
    activeCount: 0,
    criticalP1Count: 0,
    todayCount: 0,
    resolvedCount: 0,
    slaRate: 100,
    avgResolutionMins: 0,
    teamsSent: 0,
    teamsFailed: 0,
    teamsSuccessRate: 100,
  });

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [externalFilter, setExternalFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Category Modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatColor, setNewCatColor] = useState('#0284c7');
  const [isCreatingCat, setIsCreatingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');
  const [editCatColor, setEditCatColor] = useState('#0284c7');
  const [isSavingCat, setIsSavingCat] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  // Root Cause Modal
  const [rootCauseTree, setRootCauseTree] = useState<RootCauseNode[]>(DEFAULT_ROOT_CAUSE_TREE);
  const [showRootCauseModal, setShowRootCauseModal] = useState(false);

  // Outbound webhook ping feedback
  const [webhookPingStatus, setWebhookPingStatus] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>('Admin');
  const [currentUserRole, setCurrentUserRole] = useState<'STAFF' | 'MANAGER' | null>(null);

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
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (urgencyFilter !== 'ALL') params.set('urgency', urgencyFilter);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
      if (deptFilter !== 'ALL') params.set('department', deptFilter);
      if (externalFilter !== 'ALL') params.set('resolvedByExternal', externalFilter);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await fetch(`/api/incidents?${params.toString()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setIncidents(data.incidents || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalRecords(data.pagination?.total || 0);
        if (data.kpis) {
          setKpis(data.kpis);
        }
      }
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCategories(data || []);
      }
    } catch (e) {
      console.error('Failed to fetch categories:', e);
    }
  };

  const fetchRootCauseTree = async () => {
    try {
      const res = await fetch('/api/root-causes?format=tree', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) setRootCauseTree(data);
      }
    } catch (e) {
      console.error('Failed to fetch root cause tree:', e);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchRootCauseTree();
    fetch('/api/departments', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (Array.isArray(d)) setDepartments(d.filter((v): v is string => typeof v === 'string'));
      })
      .catch(() => {});
    fetch('/api/auth/admin', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated && d.user?.name) {
          setCurrentUserName(d.user.name);
        }
        if (d.authenticated && d.user?.role) {
          setCurrentUserRole(d.user.role);
        }
      })
      .catch(() => {});
  }, []);

  const latestRefreshRef = useRef<() => void>(() => {});
  latestRefreshRef.current = () => {
    fetchIncidents();
    fetchCategories();
  };

  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) latestRefreshRef.current();
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  useEffect(() => {
    fetchIncidents();
  }, [search, statusFilter, urgencyFilter, categoryFilter, deptFilter, externalFilter, page, limit]);

  // Create Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setIsCreatingCat(true);
    setCatError(null);
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
      } else {
        const err = await res.json().catch(() => ({}));
        setCatError(err.error || 'Failed to add category');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreatingCat(false);
    }
  };

  // Update Category
  const handleSaveCategory = async (catId: string) => {
    if (!editCatName.trim()) return;
    setIsSavingCat(true);
    setCatError(null);
    try {
      const res = await fetch(`/api/categories/${catId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editCatName.trim(),
          description: editCatDesc.trim(),
          color: editCatColor,
        }),
      });
      if (res.ok) {
        setEditingCatId(null);
        await Promise.all([fetchCategories(), fetchIncidents()]);
      } else {
        const err = await res.json().catch(() => ({}));
        setCatError(err.error || 'Failed to update category');
      }
    } catch (e) {
      console.error(e);
      setCatError('Failed to update category');
    } finally {
      setIsSavingCat(false);
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
          assignedTo: currentUserName || 'Admin',
        }),
      });
      if (res.ok) {
        fetchIncidents();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Send Outbound Webhook Dispatch (specific incident or diagnostic ping)
  const handleSendWebhookPing = async (targetIncident?: IncidentRecord) => {
    setWebhookPingStatus(targetIncident ? `Sending ${targetIncident.ticketNo}...` : 'Sending ping...');
    try {
      const res = await fetch('/api/webhook/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: targetIncident ? JSON.stringify(targetIncident) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setWebhookPingStatus(data.message || data.error || 'Webhook forwarding failed');
      } else if (targetIncident) {
        setWebhookPingStatus(
          data.simulated
            ? `Forwarded ${targetIncident.ticketNo} (Simulated)`
            : `Forwarded ${targetIncident.ticketNo} via Webhook`
        );
      } else {
        setWebhookPingStatus(data.simulated ? 'Ping Sent (Simulated Mode)' : 'Ping Sent (HTTP 200)');
      }
    } catch {
      setWebhookPingStatus('Webhook forwarding failed');
    } finally {
      setTimeout(() => setWebhookPingStatus(null), 4000);
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setUrgencyFilter('ALL');
    setCategoryFilter('ALL');
    setDeptFilter('ALL');
    setExternalFilter('ALL');
    setPage(1);
  };



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
    <div className="w-full bg-[#f5f7fa] min-h-[calc(100vh-4rem)]">
      <div className="w-full px-6 lg:px-10 py-8 max-w-[1680px] mx-auto space-y-6">
        {/* Top Bar: Title & Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1 shrink-0">
            <h1 className="text-2xl font-headline font-semibold text-slate-900 tracking-tight whitespace-nowrap">
              IT Operations &amp; Incident Dashboard
            </h1>
            {webhookPingStatus && (
              <p role="status" className="text-xs font-medium text-sky-700">
                {webhookPingStatus}
              </p>
            )}
          </div>

          {/* Quick Action Pipeline Controls */}
          <div className="flex items-center flex-wrap xl:flex-nowrap gap-2">
            <a
              href={`/api/incidents/export?${new URLSearchParams({
                ...(search ? { search } : {}),
                ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
                ...(urgencyFilter !== 'ALL' ? { urgency: urgencyFilter } : {}),
                ...(categoryFilter !== 'ALL' ? { category: categoryFilter } : {}),
                ...(deptFilter !== 'ALL' ? { department: deptFilter } : {}),
                ...(externalFilter !== 'ALL' ? { resolvedByExternal: externalFilter } : {}),
              }).toString()}`}
              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-medium text-white flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              title="Export filtered incidents to Excel (.CSV UTF-8 with BOM)"
            >
              <span className="material-symbols-outlined text-[16px]">table_view</span>
              <span>Export Excel (.CSV)</span>
            </a>

            <Link
              href="/admin/analytics"
              className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 border border-slate-200 hover:border-slate-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <span className="material-symbols-outlined text-[16px] text-slate-500">bar_chart</span>
              <span>Analytics &amp; Graphs</span>
            </Link>

            <Link
              href="/admin/integrations"
              className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 border border-slate-200 hover:border-slate-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <span className="material-symbols-outlined text-[16px] text-slate-500">hub</span>
              <span>Integrations &amp; API</span>
            </Link>

            {/* Manage Categories Modal Trigger (Requirement: Add categories later) */}
            <button
              onClick={() => setShowCatModal(true)}
              className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 border border-slate-200 hover:border-slate-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Manage and add custom ticket categories"
            >
              <span className="material-symbols-outlined text-[16px] text-slate-500">category</span>
              <span className="tabular-nums">Manage Categories ({categories.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setShowRootCauseModal(true)}
              className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 border border-slate-200 hover:border-slate-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Manage hierarchical root cause groups and sub-branches"
            >
              <span className="material-symbols-outlined text-[16px] text-slate-500">troubleshoot</span>
              <span className="tabular-nums">Manage Root Causes ({rootCauseTree.length})</span>
            </button>
          </div>
        </div>

        {/* Operational KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Metric 1: Total Active */}
          <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Active Incidents</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-headline font-semibold tabular-nums text-slate-900">{kpis.activeCount}</span>
                  <span className="text-xs font-medium text-sky-700 flex items-center font-mono tabular-nums">
                    <span className="material-symbols-outlined text-[14px]">arrow_upward</span> +{kpis.todayCount} today
                  </span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500">
                <span className="material-symbols-outlined text-[18px]">layers</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{kpis.activeCount === 0 ? 'All tickets resolved' : `${kpis.activeCount} in progress`}</span>
              <span className="text-slate-700 font-mono tabular-nums font-medium bg-slate-100 px-1.5 py-0.5 rounded">
                {kpis.totalRecords > 0 ? `${Math.round((kpis.activeCount / kpis.totalRecords) * 100)}% load` : '0%'}
              </span>
            </div>
          </div>

          {/* Metric 2: High Urgency / Blocker */}
          <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Critical • P1 Blocker</p>
                <div className="flex items-baseline gap-2.5 mt-2">
                  <span className="text-3xl font-headline font-semibold tabular-nums text-rose-600">{kpis.criticalP1Count}</span>
                  {kpis.criticalP1Count > 0 && (
                    <span className="inline-flex rounded-full h-2 w-2 bg-rose-600" />
                  )}
                </div>
              </div>
              <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-rose-600">
                <span className="material-symbols-outlined text-[18px]">emergency_heat</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {kpis.criticalP1Count > 0 ? 'Active P1 in progress' : 'No critical blockers'}
              </span>
              <span className={`font-medium px-1.5 py-0.5 rounded border tabular-nums ${
                kpis.criticalP1Count > 0
                  ? 'text-rose-700 bg-rose-50 border-rose-200'
                  : 'text-emerald-700 bg-emerald-50 border-emerald-200'
              }`}>
                {kpis.criticalP1Count > 0 ? `${kpis.criticalP1Count} Urgent` : 'Nominal'}
              </span>
            </div>
          </div>

          {/* Metric 3: MTTR & SLA */}
          <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Resolution &amp; SLA (MTTR)</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-headline font-semibold tabular-nums text-slate-900">
                    {kpis.avgResolutionMins > 0
                      ? (kpis.avgResolutionMins >= 60 ? `${(kpis.avgResolutionMins / 60).toFixed(1)}h` : `${kpis.avgResolutionMins}m`)
                      : '—'}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">avg</span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500">
                <span className="material-symbols-outlined text-[18px]">timer</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${kpis.slaRate >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                <span className="font-medium text-slate-600 tabular-nums">{kpis.slaRate}% SLA resolved</span>
              </div>
              <span className="text-slate-700 font-mono tabular-nums font-medium bg-slate-100 px-1.5 py-0.5 rounded">
                {kpis.resolvedCount} closed
              </span>
            </div>
          </div>
        </div>

        {/* Filter & Precision Search Strip */}
        <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
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
              placeholder="Search ticket ID, reporter, or details"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 text-xs rounded-lg focus:outline-none focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-colors"
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
                className="appearance-none bg-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-xs text-slate-700 py-2.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:border-sky-500 font-medium transition-colors"
              >
                <option value="ALL">Status: All</option>
                <option value="ACTIVE">Active (Open + In Progress + Pending Confirm)</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="ON_HOLD">On Hold (รอ Solution)</option>
                <option value="PENDING_CONFIRM">Pending Confirm (รออนุมัติปิด)</option>
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
                className="appearance-none bg-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-xs text-slate-700 py-2.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:border-sky-500 font-medium transition-colors"
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
                className="appearance-none bg-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-xs text-slate-700 py-2.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:border-sky-500 font-medium transition-colors"
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
                onChange={(e) => {
                  setDeptFilter(e.target.value);
                  setPage(1);
                }}
                className="appearance-none bg-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-xs text-slate-700 py-2.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:border-sky-500 font-medium transition-colors"
              >
                <option value="ALL">Dept: All Units</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                expand_more
              </span>
            </div>

            {/* External User Filter */}
            <div className="relative">
              <select
                value={externalFilter}
                onChange={(e) => {
                  setExternalFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by solver"
                className="appearance-none bg-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-xs text-slate-700 py-2.5 pl-3 pr-8 rounded-lg cursor-pointer focus:outline-none focus:border-sky-500 font-medium transition-colors"
              >
                <option value="ALL">Solver: All</option>
                <option value="false">IT Team</option>
                <option value="true">External User</option>
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
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs">
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Ticket ID</th>
                  <th className="py-3.5 px-3 font-semibold">Age</th>
                  <th className="py-3.5 px-3 font-semibold whitespace-nowrap">Urgency</th>
                  <th className="py-3.5 px-3 font-semibold whitespace-nowrap">Category</th>
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
                        <td className="py-3.5 px-4 font-mono font-semibold text-sky-700 whitespace-nowrap">
                          <Link
                            href={`/admin/incidents/${inc.ticketNo}`}
                            className="inline-flex items-center gap-2 hover:underline whitespace-nowrap"
                          >
                            <span className="material-symbols-outlined text-[14px] text-sky-600 shrink-0">
                              {isHigh ? 'shield_lock' : isResolved ? 'check_circle' : 'receipt_long'}
                            </span>
                            <span>{inc.ticketNo}</span>
                          </Link>
                        </td>
                        <td className="py-3.5 px-3 font-mono text-slate-500">{getAge(inc.createdAt)}</td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {isHigh ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/80 whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                              P1 HIGH
                            </span>
                          ) : isMed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60 whitespace-nowrap">
                              P2 MED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                              P3 LOW
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-1">
                            {(() => {
                              const catName = inc.categoryRel?.name || inc.category;
                              const catColor =
                                inc.categoryRel?.color ||
                                categories.find(
                                  (c) =>
                                    c.id === inc.categoryId ||
                                    c.name.toLowerCase() === (catName || '').toLowerCase()
                                )?.color ||
                                null;
                              return (
                                <span
                                  title={catName || 'Uncategorized'}
                                  style={
                                    catColor
                                      ? {
                                          backgroundColor: `${catColor}18`,
                                          borderColor: `${catColor}55`,
                                        }
                                      : undefined
                                  }
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border font-medium whitespace-nowrap max-w-[240px] truncate ${
                                    catColor
                                      ? 'text-slate-800'
                                      : 'bg-sky-50 text-sky-800 border-sky-100'
                                  }`}
                                >
                                  {catColor && (
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: catColor }}
                                    />
                                  )}
                                  <span className="truncate">{catName || 'Uncategorized'}</span>
                                </span>
                              );
                            })()}
                            {inc.rootCause && (
                              <span
                                title={`RCA: ${inc.rootCause}`}
                                className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-100 font-medium whitespace-nowrap max-w-[240px] truncate"
                              >
                                RCA: {inc.rootCause}
                              </span>
                            )}
                          </div>
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
                              <span>{inc.department || '-'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                                inc.status === 'OPEN'
                                  ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                  : inc.status === 'IN_PROGRESS'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : inc.status === 'ON_HOLD'
                                  ? 'bg-violet-50 text-violet-700 border border-violet-200'
                                  : inc.status === 'PENDING_CONFIRM'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  inc.status === 'OPEN'
                                    ? 'bg-sky-500'
                                    : inc.status === 'IN_PROGRESS'
                                    ? 'bg-amber-500'
                                    : inc.status === 'ON_HOLD'
                                    ? 'bg-violet-500'
                                    : inc.status === 'PENDING_CONFIRM'
                                    ? 'bg-indigo-500'
                                    : 'bg-emerald-500'
                                }`}
                              ></span>
                              {inc.status === 'PENDING_CONFIRM' ? 'PENDING CONFIRM' : inc.status}
                            </span>
                            {inc.resolutionType === 'WORKAROUND' && (
                              <span
                                title={inc.workaroundNote || 'ปิดแบบมีเงื่อนไข (Workaround)'}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap"
                              >
                                <span className="material-symbols-outlined text-[12px]">build_circle</span>
                                Workaround
                              </span>
                            )}
                            {inc.resolvedByExternal && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-800 border border-teal-200 whitespace-nowrap">
                                <span className="material-symbols-outlined text-[12px]">person_check</span>
                                External User
                              </span>
                            )}
                          </div>
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
                          ) : inc.resolvedByExternal ? (
                            <div className="flex items-center gap-1.5 text-teal-700 font-medium text-[11px]">
                              <span className="material-symbols-outlined text-[15px]">person_check</span>
                              <span>External User</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-slate-400">
                              <span className="material-symbols-outlined text-[15px]">person_off</span>
                              <span className="text-[11px]">Unassigned</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/admin/incidents/${inc.ticketNo}`}
                              className="px-2.5 py-1 rounded bg-sky-50 hover:bg-sky-600 hover:text-white text-sky-700 border border-sky-200 transition-colors text-[11px] font-medium flex items-center gap-1"
                              title="ดูรายละเอียดและจัดการเคส"
                            >
                              <span className="material-symbols-outlined text-[13px]">visibility</span> Detail
                            </Link>

                            {inc.status === 'OPEN' && currentUserRole !== 'MANAGER' && (
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
                              onClick={() => handleSendWebhookPing(inc)}
                              className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 border border-slate-200 transition-colors cursor-pointer"
                              title={`Forward payload for ${inc.ticketNo} via Outbound Webhook`}
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
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Showing <strong className="text-slate-900 font-semibold">{incidents.length}</strong> of{' '}
                <strong className="text-slate-900 font-semibold">{totalRecords}</strong> records
              </span>
              <label className="flex items-center gap-1.5 text-slate-500">
                <span>Show</span>
                <span className="relative inline-flex items-center">
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setPage(1);
                    }}
                    aria-label="Records per page"
                    className="appearance-none bg-none bg-white border border-slate-200 rounded-md py-1 pl-2.5 pr-7 text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:border-sky-500"
                  >
                    {[10, 25, 50, 100].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[15px] text-slate-400">
                    expand_more
                  </span>
                </span>
                <span>/ page</span>
              </label>
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-lg border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-500">category</span>
                <h3 className="font-headline font-semibold text-base text-slate-900">Manage Categories</h3>
              </div>
              <button
                onClick={() => setShowCatModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Existing Categories List */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              <div className="text-xs font-medium text-slate-500">Active Categories</div>
              {catError && (
                <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {catError}
                </div>
              )}
              {categories.map((cat) =>
                editingCatId === cat.id ? (
                  <div
                    key={cat.id}
                    className="p-2.5 rounded-xl bg-sky-50/70 border border-sky-200 space-y-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editCatColor}
                        onChange={(e) => setEditCatColor(e.target.value)}
                        aria-label="Edit category color"
                        className="h-7 w-10 rounded border border-slate-200 cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        value={editCatName}
                        onChange={(e) => setEditCatName(e.target.value)}
                        placeholder="Category name"
                        className="flex-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <input
                      type="text"
                      value={editCatDesc}
                      onChange={(e) => setEditCatDesc(e.target.value)}
                      placeholder="Description (Optional)"
                      className="w-full px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-sky-500"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={isSavingCat}
                        onClick={() => {
                          setEditingCatId(null);
                          setCatError(null);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 text-[11px] font-medium cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isSavingCat || !editCatName.trim()}
                        onClick={() => handleSaveCategory(cat.id)}
                        className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {isSavingCat ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color || '#0284c7' }}></span>
                      <span className="font-semibold text-slate-900 truncate">{cat.name}</span>
                      {cat.description && <span className="text-slate-500 text-[11px] truncate max-w-[180px]">({cat.description})</span>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCatId(cat.id);
                          setEditCatName(cat.name);
                          setEditCatDesc(cat.description || '');
                          setEditCatColor(cat.color || '#0284c7');
                          setCatError(null);
                        }}
                        className="text-slate-400 hover:text-sky-600 p-1 rounded cursor-pointer"
                        title="Edit category"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded cursor-pointer"
                        title="Delete category"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Add New Category Form */}
            <form onSubmit={handleCreateCategory} className="border-t border-slate-100 pt-4 space-y-3">
              <div className="text-xs font-medium text-slate-500">Add New Category</div>
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

      <ManageRootCausesModal
        isOpen={currentUserRole !== 'MANAGER' && showRootCauseModal}
        onClose={() => setShowRootCauseModal(false)}
        tree={rootCauseTree}
        onTreeUpdated={setRootCauseTree}
        onDataMutated={fetchIncidents}
      />
    </div>
  );
}
