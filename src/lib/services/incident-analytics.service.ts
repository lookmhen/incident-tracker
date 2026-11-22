import prisma from '@/lib/prisma';
import { buildFilterWhere, normalizeDepartment } from './incident-shared';
import { RootCauseService } from './root-cause.service';

export class IncidentAnalyticsService {
  private static readonly MTTR_EXCLUDED_KEY = 'mttr_excluded_tickets';

  public static groupDepartments(rows: Array<{ department: string | null }>, includeEmpty: boolean) {
    const buckets = new Map<string, { count: number; variants: Map<string, number> }>();
    for (const r of rows) {
      const normalized = normalizeDepartment(r.department);
      if (!normalized && !includeEmpty) continue;
      const display = normalized || 'General / Unspecified';
      const key = display.toLowerCase();
      const bucket = buckets.get(key) || { count: 0, variants: new Map() };
      bucket.count++;
      bucket.variants.set(display, (bucket.variants.get(display) || 0) + 1);
      buckets.set(key, bucket);
    }
    return Array.from(buckets.values()).map((b) => {
      const label = Array.from(b.variants.entries()).sort(
        (a, c) => c[1] - a[1] || a[0].localeCompare(c[0])
      )[0][0];
      return { department: label, count: b.count };
    });
  }

  /**
   * Returns canonical, case-insensitively deduplicated department names for autocomplete
   */
  public static async getDepartments(query?: string): Promise<string[]> {
    const rows = await prisma.incident.findMany({
      where: { department: { not: null } },
      select: { department: true },
    });
    const list = this.groupDepartments(rows, false)
      .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department))
      .map((d) => d.department);
    const q = query?.trim().toLowerCase();
    return q ? list.filter((d) => d.toLowerCase().includes(q)) : list;
  }

  public static async getMttrExcludedIds(): Promise<Set<string>> {
    const row = await prisma.integrationConfig.findUnique({
      where: { key: this.MTTR_EXCLUDED_KEY },
    });
    if (!row?.value) return new Set();
    try {
      const parsed = JSON.parse(row.value);
      return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === 'string')) : new Set();
    } catch {
      return new Set();
    }
  }

  public static async setMttrExcluded(incidentId: string, excluded: boolean): Promise<boolean> {
    const ids = await this.getMttrExcludedIds();
    if (excluded) ids.add(incidentId);
    else ids.delete(incidentId);
    const value = JSON.stringify(Array.from(ids));
    await prisma.integrationConfig.upsert({
      where: { key: this.MTTR_EXCLUDED_KEY },
      update: { value, isEnabled: true },
      create: { key: this.MTTR_EXCLUDED_KEY, value, isEnabled: true },
    });
    return excluded;
  }

  /**
   * Retrieves 4-dimension analytics dataset for /admin/analytics
   */
  public static async getAnalyticsData(query: {
    startDate?: string;
    endDate?: string;
    groupBy?: 'auto' | 'day' | 'month';
    urgency?: string;
    category?: string;
    rootCause?: string;
    department?: string;
    resolutionType?: string;
  }) {
    const where = buildFilterWhere(query);
    const [records, distinctFilterRows, excludedIds, configuredRootCauses] = await Promise.all([
      prisma.incident.findMany({
        where,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.incident.findMany({
        select: { category: true, department: true, rootCause: true },
      }),
      this.getMttrExcludedIds(),
      RootCauseService.getRootCauseOptions(),
    ]);

    const normStatus = (s?: string | null) => (s || 'OPEN').trim().toUpperCase();
    const normUrgency = (u?: string | null) => (u || 'MEDIUM').trim().toUpperCase();

    const total = records.length;
    const resolvedRecords = records.filter((r) => ['RESOLVED', 'CLOSED'].includes(normStatus(r.status)));
    const resolvedCount = resolvedRecords.length;
    const openCount = records.filter((r) => normStatus(r.status) === 'OPEN').length;
    const inProgressCount = records.filter((r) => normStatus(r.status) === 'IN_PROGRESS').length;
    const pendingConfirmCount = records.filter((r) => normStatus(r.status) === 'PENDING_CONFIRM').length;
    const onHoldCount = records.filter((r) => normStatus(r.status) === 'ON_HOLD').length;
    const criticalCount = records.filter((r) => normUrgency(r.urgency) === 'HIGH').length;
    const resolutionRate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;

    // Avg resolution time in minutes (overall, by urgency, and by category; excludes ON_HOLD / mttrExcluded)
    let totalDurationMins = 0;
    let durationSamples = 0;
    const mttrUrgencyMap = new Map<string, { sum: number; count: number }>([
      ['HIGH', { sum: 0, count: 0 }],
      ['MEDIUM', { sum: 0, count: 0 }],
      ['LOW', { sum: 0, count: 0 }],
    ]);
    const mttrCatMap = new Map<string, { sum: number; count: number }>();

    for (const r of resolvedRecords) {
      if (excludedIds.has(r.id)) continue;
      if (r.closedAt) {
        const diff = (new Date(r.closedAt).getTime() - new Date(r.createdAt).getTime()) / 60000;
        if (diff >= 0) {
          totalDurationMins += diff;
          durationSamples++;

          const uKey = normUrgency(r.urgency);
          const uBucket = mttrUrgencyMap.get(uKey);
          if (uBucket) {
            uBucket.sum += diff;
            uBucket.count++;
          }

          const cKey = r.category?.trim() || 'Uncategorized';
          const cBucket = mttrCatMap.get(cKey) || { sum: 0, count: 0 };
          cBucket.sum += diff;
          cBucket.count++;
          mttrCatMap.set(cKey, cBucket);
        }
      }
    }
    const avgResolutionMins = durationSamples > 0 ? Math.round(totalDurationMins / durationSamples) : 0;

    const mttrByUrgency = (['HIGH', 'MEDIUM', 'LOW'] as const).map((urgency) => {
      const b = mttrUrgencyMap.get(urgency)!;
      return {
        urgency,
        avgMins: b.count > 0 ? Math.round(b.sum / b.count) : 0,
        count: b.count,
      };
    });

    const mttrByCategory = Array.from(mttrCatMap.entries())
      .map(([category, b]) => ({
        category,
        avgMins: Math.round(b.sum / b.count),
        count: b.count,
      }))
      .sort((a, b) => b.avgMins - a.avgMins);

    // Backlog Aging (for active OPEN / IN_PROGRESS / PENDING_CONFIRM records; excludes ON_HOLD, RESOLVED, CLOSED)
    const nowMs = Date.now();
    const agingCounts = { under_24h: 0, d1_3: 0, d4_7: 0, over_7d: 0 };
    for (const r of records) {
      if (!['OPEN', 'IN_PROGRESS', 'PENDING_CONFIRM'].includes(normStatus(r.status))) continue;
      const ageHours = Math.max(0, (nowMs - new Date(r.createdAt).getTime()) / 3600000);
      if (ageHours < 24) agingCounts.under_24h++;
      else if (ageHours < 72) agingCounts.d1_3++;
      else if (ageHours <= 168) agingCounts.d4_7++;
      else agingCounts.over_7d++;
    }
    const backlogAging = [
      { key: 'under_24h', label: '< 24 ชม.', count: agingCounts.under_24h },
      { key: '1_3d', label: '1–3 วัน', count: agingCounts.d1_3 },
      { key: '4_7d', label: '4–7 วัน', count: agingCounts.d4_7 },
      { key: 'over_7d', label: '> 7 วัน', count: agingCounts.over_7d },
    ];

    const filterOptions = {
      categories: Array.from(
        new Set(distinctFilterRows.map((r) => r.category?.trim()).filter((v): v is string => Boolean(v)))
      ).sort(),
      rootCauses: Array.from(
        new Set([
          ...configuredRootCauses,
          ...distinctFilterRows.map((r) => r.rootCause?.trim()).filter((v): v is string => Boolean(v)),
        ])
      ),
      departments: this.groupDepartments(distinctFilterRows, false)
        .map((d) => d.department)
        .sort((a, b) => a.localeCompare(b)),
    };

    // Determine Grouping: 'day' vs 'month'
    let effectiveGroupBy: 'day' | 'month' = 'day';
    if (query.groupBy === 'month') {
      effectiveGroupBy = 'month';
    } else if (query.groupBy === 'day') {
      effectiveGroupBy = 'day';
    } else {
      // Auto: if date range spans > 31 days or if total record range spans > 45 days
      if (query.startDate && query.endDate) {
        const spanDays = (new Date(query.endDate).getTime() - new Date(query.startDate).getTime()) / (1000 * 3600 * 24);
        if (spanDays > 31) effectiveGroupBy = 'month';
      } else if (records.length > 1) {
        const first = new Date(records[0].createdAt).getTime();
        const last = new Date(records[records.length - 1].createdAt).getTime();
        if ((last - first) / (1000 * 3600 * 24) > 45) effectiveGroupBy = 'month';
      }
    }

    const thaiMonthShort = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

    interface TrendItem {
      date: string;
      label: string;
      total: number;
      high: number;
      resolved: number;
    }

    const trendMap = new Map<string, TrendItem>();

    if (effectiveGroupBy === 'month') {
      // If a full year or date range is requested, pre-fill months with 0
      if (query.startDate && query.endDate) {
        const startYear = new Date(query.startDate).getUTCFullYear();
        const endYear = new Date(query.endDate).getUTCFullYear();
        if (startYear === endYear) {
          for (let m = 0; m < 12; m++) {
            const mKey = `${startYear}-${String(m + 1).padStart(2, '0')}`;
            trendMap.set(mKey, {
              date: mKey,
              label: thaiMonthShort[m],
              total: 0,
              high: 0,
              resolved: 0,
            });
          }
        }
      }

      for (const r of records) {
        const d = new Date(r.createdAt);
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth();
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        const entry = trendMap.get(key) || {
          date: key,
          label: `${thaiMonthShort[m]} ${String(y).slice(2)}`,
          total: 0,
          high: 0,
          resolved: 0,
        };
        entry.total++;
        if (normUrgency(r.urgency) === 'HIGH') entry.high++;
        if (['RESOLVED', 'CLOSED'].includes(normStatus(r.status))) entry.resolved++;
        trendMap.set(key, entry);
      }
    } else {
      // Group by Day (YYYY-MM-DD)
      for (const r of records) {
        const day = new Date(r.createdAt).toISOString().slice(0, 10);
        const entry = trendMap.get(day) || {
          date: day,
          label: day.slice(5),
          total: 0,
          high: 0,
          resolved: 0,
        };
        entry.total++;
        if (normUrgency(r.urgency) === 'HIGH') entry.high++;
        if (['RESOLVED', 'CLOSED'].includes(normStatus(r.status))) entry.resolved++;
        trendMap.set(day, entry);
      }
    }

    // 2. Category Share
    const catMap = new Map<string, number>();
    for (const r of records) {
      const cat = r.category || 'Uncategorized';
      catMap.set(cat, (catMap.get(cat) || 0) + 1);
    }
    const byCategory = Array.from(catMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 3. Top Departments (case-insensitive grouping)
    const byDepartment = this.groupDepartments(records, true)
      .map(({ department, count }) => ({
        department,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 3b. Root Cause Breakdown
    const rcMap = new Map<string, number>();
    for (const r of records) {
      const rc = r.rootCause?.trim() || 'Unspecified';
      rcMap.set(rc, (rcMap.get(rc) || 0) + 1);
    }
    const byRootCause = Array.from(rcMap.entries())
      .map(([rootCause, count]) => ({
        rootCause,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 4. Status & Urgency Breakdown
    const byStatus = [
      { status: 'OPEN', count: openCount },
      { status: 'IN_PROGRESS', count: inProgressCount },
      { status: 'PENDING_CONFIRM', count: pendingConfirmCount },
      { status: 'ON_HOLD', count: onHoldCount },
      { status: 'RESOLVED', count: records.filter((r) => normStatus(r.status) === 'RESOLVED').length },
      { status: 'CLOSED', count: records.filter((r) => normStatus(r.status) === 'CLOSED').length },
    ];

    const byUrgency = [
      { urgency: 'HIGH', count: criticalCount },
      { urgency: 'MEDIUM', count: records.filter((r) => normUrgency(r.urgency) === 'MEDIUM').length },
      { urgency: 'LOW', count: records.filter((r) => normUrgency(r.urgency) === 'LOW').length },
    ];

    return {
      summary: {
        total,
        resolvedCount,
        openCount,
        inProgressCount,
        pendingConfirmCount,
        onHoldCount,
        criticalCount,
        resolutionRate,
        avgResolutionMins,
      },
      groupBy: effectiveGroupBy,
      trend: Array.from(trendMap.values()),
      byCategory,
      byRootCause,
      byDepartment,
      byStatus,
      byUrgency,
      mttrByUrgency,
      mttrByCategory,
      backlogAging,
      filterOptions,
    };
  }
}
