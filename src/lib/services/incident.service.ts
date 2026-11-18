import prisma from '@/lib/prisma';
import { TeamsService } from './teams.service';
import { EmailService } from './email.service';
import { McpService } from './mcp.service';
import fs from 'fs';
import path from 'path';

export interface CreateIncidentDTO {
  reporterName: string;
  department?: string;
  contactInfo: string;
  title: string;
  description: string;
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH';
  category?: string;
  categoryId?: string;
  file?: {
    buffer: Buffer;
    fileName: string;
    fileType: string;
    fileSize: number;
  };
}

export interface IncidentFilterQuery {
  search?: string;
  status?: string;
  urgency?: string;
  category?: string;
  department?: string;
  page?: number;
  limit?: number;
}

export class IncidentService {
  /**
   * Normalizes free-text department names (trims spaces, uppercases short ASCII codes, capitalizes lowercase ASCII words).
   */
  public static normalizeDepartment(raw?: string | null): string | null {
    const cleaned = raw?.trim().replace(/\s+/g, ' ');
    if (!cleaned) return null;
    if (/^[a-zA-Z0-9]{1,4}$/.test(cleaned)) return cleaned.toUpperCase();
    if (/^[a-z\s-]+$/.test(cleaned)) {
      return cleaned.replace(/\b[a-z]/g, (c) => c.toUpperCase());
    }
    return cleaned;
  }

  private static groupDepartments(rows: Array<{ department: string | null }>, includeEmpty: boolean) {
    const buckets = new Map<string, { count: number; variants: Map<string, number> }>();
    for (const r of rows) {
      const normalized = this.normalizeDepartment(r.department);
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
   * Generates a safe, sequential Ticket ID in format: INC-YYYYMM-XXX
   */
  public static async generateTicketNo(): Promise<string> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `INC-${yearMonth}-`;

    const lastIncident = await prisma.incident.findFirst({
      where: {
        ticketNo: {
          startsWith: prefix,
        },
      },
      orderBy: {
        ticketNo: 'desc',
      },
      select: {
        ticketNo: true,
      },
    });

    let nextSeq = 1;
    if (lastIncident && lastIncident.ticketNo) {
      const parts = lastIncident.ticketNo.split('-');
      if (parts.length === 3) {
        const lastNum = parseInt(parts[2], 10);
        if (!isNaN(lastNum)) {
          nextSeq = lastNum + 1;
        }
      }
    }

    return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  }

  /**
   * Saves an uploaded buffer to ./public/uploads
   */
  public static async saveUploadedFile(file: {
    buffer: Buffer;
    fileName: string;
    fileType: string;
    fileSize: number;
  }): Promise<{ fileUrl: string; fileName: string; fileType: string; fileSize: number }> {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const safeName = file.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueFileName = `${Date.now()}_${safeName}`;
    const targetPath = path.join(uploadDir, uniqueFileName);

    await fs.promises.writeFile(targetPath, file.buffer);

    return {
      fileUrl: `/uploads/${uniqueFileName}`,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
    };
  }

  /**
   * Creates a new incident, persists attachment, and fires Teams Webhook
   */
  public static async createIncident(data: CreateIncidentDTO) {
    const ticketNo = await this.generateTicketNo();
    const cleanDesc = McpService.cleanText(data.description);
    const cleanTitle = McpService.cleanText(data.title);

    let savedAttachment: { fileUrl: string; fileName: string; fileType: string; fileSize: number } | null = null;
    if (data.file && data.file.buffer) {
      savedAttachment = await this.saveUploadedFile(data.file);
    }

    const created = await prisma.incident.create({
      data: {
        ticketNo,
        reporterName: data.reporterName.trim(),
        department: this.normalizeDepartment(data.department),
        contactInfo: data.contactInfo.trim(),
        title: cleanTitle,
        description: cleanDesc,
        urgency: data.urgency || 'MEDIUM',
        category: data.category?.trim() || null,
        categoryId: data.categoryId || null,
        status: 'OPEN',
        attachments: savedAttachment
          ? {
              create: {
                fileUrl: savedAttachment.fileUrl,
                fileName: savedAttachment.fileName,
                fileType: savedAttachment.fileType,
                fileSize: savedAttachment.fileSize,
              },
            }
          : undefined,
      },
      include: {
        attachments: true,
        categoryRel: true,
      },
    });

    // Asynchronously dispatch to Microsoft Teams & Admin Email in parallel (non-blocking)
    const firstAttachmentUrl = created.attachments?.[0]?.fileUrl || null;
    Promise.allSettled([
      TeamsService.dispatch({
        ticketNo: created.ticketNo,
        title: created.title,
        description: created.description,
        reporterName: created.reporterName,
        department: created.department,
        contactInfo: created.contactInfo,
        urgency: created.urgency,
        category: created.category,
      }),
      EmailService.dispatch({
        ticketNo: created.ticketNo,
        title: created.title,
        description: created.description,
        reporterName: created.reporterName,
        department: created.department,
        contactInfo: created.contactInfo,
        urgency: created.urgency,
        category: created.category,
        attachmentUrl: firstAttachmentUrl,
      }),
    ]).catch((e) => console.error('Background notification dispatch error:', e));

    return created;
  }

  /**
   * Retrieves list of incidents with filters and aggregated KPIs
   */
  public static async getIncidents(query: IncidentFilterQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where = this.buildFilterWhere(query);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      matchingMeta,
      totalAll,
      activeCount,
      p1Count,
      todayCount,
      resolvedCount,
      teamsSent,
      teamsFailed,
    ] = await Promise.all([
      prisma.incident.findMany({
        where,
        select: { id: true, status: true, urgency: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.incident.count(),
      prisma.incident.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.incident.count({ where: { urgency: 'HIGH', status: { notIn: ['CLOSED', 'RESOLVED'] } } }),
      prisma.incident.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.incident.count({ where: { status: { in: ['RESOLVED', 'CLOSED'] } } }),
      prisma.notificationLog.count({ where: { channel: 'TEAMS' } }),
      prisma.notificationLog.count({ where: { channel: 'TEAMS', status: 'FAILED' } }),
    ]);

    const statusRank = (s: string) => {
      const up = (s || '').trim().toUpperCase();
      if (up === 'OPEN') return 0;
      if (up === 'IN_PROGRESS') return 1;
      return 2;
    };
    const urgencyRank = (u: string) => {
      const up = (u || '').trim().toUpperCase();
      if (up === 'HIGH') return 0;
      if (up === 'MEDIUM') return 1;
      return 2;
    };

    matchingMeta.sort((a, b) => {
      const sa = statusRank(a.status);
      const sb = statusRank(b.status);
      if (sa !== sb) return sa - sb;
      if (sa < 2) {
        const ua = urgencyRank(a.urgency);
        const ub = urgencyRank(b.urgency);
        if (ua !== ub) return ua - ub;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const total = matchingMeta.length;
    const pageIds = matchingMeta.slice(skip, skip + limit).map((m) => m.id);
    const unsortedIncidents = pageIds.length
      ? await prisma.incident.findMany({
          where: { id: { in: pageIds } },
          include: {
            attachments: true,
            categoryRel: true,
          },
        })
      : [];
    const byId = new Map(unsortedIncidents.map((inc) => [inc.id, inc]));
    const incidents = pageIds.map((id) => byId.get(id)!).filter(Boolean);

    // Average resolution time (MTTR) calculation from closed records
    const resolvedSamples = await prisma.incident.findMany({
      where: { status: { in: ['RESOLVED', 'CLOSED'] }, closedAt: { not: null } },
      select: { createdAt: true, closedAt: true },
    });
    let totalMins = 0;
    let sampleCount = 0;
    for (const r of resolvedSamples) {
      if (r.closedAt) {
        const diff = (new Date(r.closedAt).getTime() - new Date(r.createdAt).getTime()) / 60000;
        if (diff >= 0) {
          totalMins += diff;
          sampleCount++;
        }
      }
    }
    const avgResolutionMins = sampleCount > 0 ? Math.round(totalMins / sampleCount) : 0;
    const slaRate = totalAll > 0 ? Math.round((resolvedCount / totalAll) * 100) : 100;
    const teamsSuccessRate = teamsSent > 0 ? Math.round(((teamsSent - teamsFailed) / teamsSent) * 100) : 100;

    return {
      incidents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      kpis: {
        totalRecords: totalAll,
        activeCount,
        criticalP1Count: p1Count,
        todayCount,
        resolvedCount,
        slaRate,
        avgResolutionMins,
        teamsSent,
        teamsFailed,
        teamsSuccessRate,
      },
    };
  }

  /**
   * Retrieves an incident by id or ticketNo
   */
  public static async getIncidentById(idOrTicketNo: string) {
    if (!idOrTicketNo) return null;
    const clean = decodeURIComponent(idOrTicketNo).trim();

    // 1. Exact match by internal CUID or ticketNo
    let found = await prisma.incident.findFirst({
      where: {
        OR: [{ id: clean }, { ticketNo: clean }],
      },
      include: {
        attachments: true,
        categoryRel: true,
      },
    });

    // 2. Fallback: match by ending ticket number or legacy ID (e.g. '129' -> 'INC-202608-0129')
    if (!found) {
      const padded = clean.padStart(4, '0');
      found = await prisma.incident.findFirst({
        where: {
          OR: [
            { ticketNo: { endsWith: `-${padded}` } },
            { ticketNo: { endsWith: padded } },
            { ticketNo: { contains: clean } },
          ],
        },
        include: {
          attachments: true,
          categoryRel: true,
        },
      });
    }

    return found;
  }

  /**
   * Updates an incident (triage category, responder, status, resolution)
   */
  public static async updateIncident(
    idOrTicketNo: string,
    data: {
      title?: string;
      description?: string;
      category?: string;
      categoryId?: string;
      urgency?: string;
      status?: string;
      assignedTo?: string;
      resolution?: string;
      createdAt?: string | Date;
      closedAt?: string | Date | null;
    }
  ) {
    const target = await this.getIncidentById(idOrTicketNo);
    if (!target) {
      throw new Error(`Incident not found: ${idOrTicketNo}`);
    }

    const updatePayload: any = {};

    if (data.title !== undefined) updatePayload.title = McpService.cleanText(data.title);
    if (data.description !== undefined) updatePayload.description = McpService.cleanText(data.description);
    if (data.category !== undefined) updatePayload.category = data.category;
    if (data.categoryId !== undefined) updatePayload.categoryId = data.categoryId;
    if (data.urgency !== undefined) updatePayload.urgency = data.urgency;
    if (data.assignedTo !== undefined) updatePayload.assignedTo = data.assignedTo;

    if (data.createdAt !== undefined) {
      const parsedCreated = data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt);
      if (!data.createdAt || Number.isNaN(parsedCreated.getTime())) {
        throw new Error('Invalid createdAt date');
      }
      updatePayload.createdAt = parsedCreated;
    }

    if (data.status !== undefined) {
      updatePayload.status = data.status.toUpperCase();
      if (['RESOLVED', 'CLOSED'].includes(updatePayload.status)) {
        if (data.closedAt === undefined) {
          updatePayload.closedAt = target.closedAt ?? new Date();
        }
      } else {
        updatePayload.closedAt = null;
      }
    }

    const effectiveCreatedAt: Date = updatePayload.createdAt ?? target.createdAt;
    const effectiveStatus = updatePayload.status ?? target.status;

    if (data.closedAt !== undefined && ['RESOLVED', 'CLOSED'].includes(effectiveStatus)) {
      if (data.closedAt === null) {
        updatePayload.closedAt = null;
      } else {
        const parsed = data.closedAt instanceof Date ? data.closedAt : new Date(data.closedAt);
        if (Number.isNaN(parsed.getTime())) {
          throw new Error('Invalid closedAt date');
        }
        if (parsed.getTime() < effectiveCreatedAt.getTime()) {
          throw new Error('closedAt cannot be earlier than createdAt');
        }
        updatePayload.closedAt = parsed;
      }
    } else if (data.closedAt !== undefined && data.closedAt !== null && data.status === undefined) {
      throw new Error('Cannot set closedAt unless incident is RESOLVED or CLOSED');
    } else if (updatePayload.createdAt) {
      const effectiveClosedAt: Date | null =
        updatePayload.closedAt !== undefined ? updatePayload.closedAt : target.closedAt;
      if (effectiveClosedAt && effectiveCreatedAt.getTime() > effectiveClosedAt.getTime()) {
        throw new Error('createdAt cannot be later than closedAt');
      }
    }

    if (data.resolution !== undefined) {
      updatePayload.resolution = McpService.cleanText(data.resolution);
    }

    return prisma.incident.update({
      where: { id: target.id },
      data: updatePayload,
      include: {
        attachments: true,
        categoryRel: true,
      },
    });
  }

  /**
   * Builds filter where clause for Export and Analytics
   */
  public static buildFilterWhere(query: {
    search?: string;
    status?: string;
    urgency?: string;
    category?: string;
    department?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const where: any = {};
    if (query.status && query.status !== 'ALL') {
      const st = query.status.toUpperCase();
      where.status = st === 'ACTIVE' ? { in: ['OPEN', 'IN_PROGRESS'] } : st;
    }
    if (query.urgency && query.urgency !== 'ALL') where.urgency = query.urgency.toUpperCase();
    if (query.category && query.category !== 'ALL') {
      where.category = { contains: query.category };
    }
    if (query.department && query.department !== 'ALL') {
      where.department = { contains: query.department };
    }
    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { ticketNo: { contains: s } },
        { title: { contains: s } },
        { description: { contains: s } },
        { reporterName: { contains: s } },
      ];
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(`${query.startDate}T00:00:00.000Z`);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(`${query.endDate}T23:59:59.999Z`);
      }
    }
    return where;
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
    department?: string;
  }) {
    const where = this.buildFilterWhere(query);
    const [records, distinctFilterRows] = await Promise.all([
      prisma.incident.findMany({
        where,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.incident.findMany({
        select: { category: true, department: true },
      }),
    ]);

    const normStatus = (s?: string | null) => (s || 'OPEN').trim().toUpperCase();
    const normUrgency = (u?: string | null) => (u || 'MEDIUM').trim().toUpperCase();

    const total = records.length;
    const resolvedRecords = records.filter((r) => ['RESOLVED', 'CLOSED'].includes(normStatus(r.status)));
    const resolvedCount = resolvedRecords.length;
    const openCount = records.filter((r) => normStatus(r.status) === 'OPEN').length;
    const inProgressCount = records.filter((r) => normStatus(r.status) === 'IN_PROGRESS').length;
    const criticalCount = records.filter((r) => normUrgency(r.urgency) === 'HIGH').length;
    const resolutionRate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;

    // Avg resolution time in minutes (overall, by urgency, and by category)
    let totalDurationMins = 0;
    let durationSamples = 0;
    const mttrUrgencyMap = new Map<string, { sum: number; count: number }>([
      ['HIGH', { sum: 0, count: 0 }],
      ['MEDIUM', { sum: 0, count: 0 }],
      ['LOW', { sum: 0, count: 0 }],
    ]);
    const mttrCatMap = new Map<string, { sum: number; count: number }>();

    for (const r of resolvedRecords) {
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

    // Backlog Aging (for active OPEN / IN_PROGRESS records)
    const nowMs = Date.now();
    const agingCounts = { under_24h: 0, d1_3: 0, d4_7: 0, over_7d: 0 };
    for (const r of records) {
      if (['RESOLVED', 'CLOSED'].includes(normStatus(r.status))) continue;
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

    // 4. Status & Urgency Breakdown
    const byStatus = [
      { status: 'OPEN', count: openCount },
      { status: 'IN_PROGRESS', count: inProgressCount },
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
        criticalCount,
        resolutionRate,
        avgResolutionMins,
      },
      groupBy: effectiveGroupBy,
      trend: Array.from(trendMap.values()),
      byCategory,
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
