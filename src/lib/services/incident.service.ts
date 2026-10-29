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
        department: data.department?.trim() || null,
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

    const where: any = {};

    if (query.status && query.status !== 'ALL') {
      where.status = query.status.toUpperCase();
    }

    if (query.urgency && query.urgency !== 'ALL') {
      where.urgency = query.urgency.toUpperCase();
    }

    if (query.category && query.category !== 'ALL') {
      where.category = {
        contains: query.category,
      };
    }

    if (query.department && query.department !== 'ALL') {
      where.department = {
        contains: query.department,
      };
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { ticketNo: { contains: term } },
        { title: { contains: term } },
        { reporterName: { contains: term } },
        { description: { contains: term } },
      ];
    }

    const [total, incidents, totalAll, openCount, p1Count] = await Promise.all([
      prisma.incident.count({ where }),
      prisma.incident.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          attachments: true,
          categoryRel: true,
        },
      }),
      prisma.incident.count(),
      prisma.incident.count({ where: { status: 'OPEN' } }),
      prisma.incident.count({ where: { urgency: 'HIGH', status: { notIn: ['CLOSED', 'RESOLVED'] } } }),
    ]);

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
        activeCount: openCount,
        criticalP1Count: p1Count,
      },
    };
  }

  /**
   * Retrieves an incident by id or ticketNo
   */
  public static async getIncidentById(idOrTicketNo: string) {
    return prisma.incident.findFirst({
      where: {
        OR: [{ id: idOrTicketNo }, { ticketNo: idOrTicketNo }],
      },
      include: {
        attachments: true,
        categoryRel: true,
      },
    });
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
    }
  ) {
    const updatePayload: any = {};

    if (data.title !== undefined) updatePayload.title = McpService.cleanText(data.title);
    if (data.description !== undefined) updatePayload.description = McpService.cleanText(data.description);
    if (data.category !== undefined) updatePayload.category = data.category;
    if (data.categoryId !== undefined) updatePayload.categoryId = data.categoryId;
    if (data.urgency !== undefined) updatePayload.urgency = data.urgency;
    if (data.assignedTo !== undefined) updatePayload.assignedTo = data.assignedTo;

    if (data.status !== undefined) {
      updatePayload.status = data.status.toUpperCase();
      if (['RESOLVED', 'CLOSED'].includes(updatePayload.status)) {
        updatePayload.closedAt = new Date();
      }
    }

    if (data.resolution !== undefined) {
      updatePayload.resolution = McpService.cleanText(data.resolution);
    }

    const target = await this.getIncidentById(idOrTicketNo);
    if (!target) {
      throw new Error(`Incident not found: ${idOrTicketNo}`);
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
    if (query.status && query.status !== 'ALL') where.status = query.status.toUpperCase();
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
  public static async getAnalyticsData(query: { startDate?: string; endDate?: string }) {
    const where = this.buildFilterWhere(query);
    const records = await prisma.incident.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const total = records.length;
    const resolvedRecords = records.filter((r) => r.status === 'RESOLVED' || r.status === 'CLOSED');
    const resolvedCount = resolvedRecords.length;
    const openCount = records.filter((r) => r.status === 'OPEN').length;
    const inProgressCount = records.filter((r) => r.status === 'IN_PROGRESS').length;
    const criticalCount = records.filter((r) => r.urgency === 'HIGH').length;
    const resolutionRate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;

    // Avg resolution time in minutes
    let totalDurationMins = 0;
    let durationSamples = 0;
    for (const r of resolvedRecords) {
      if (r.closedAt) {
        const diff = (new Date(r.closedAt).getTime() - new Date(r.createdAt).getTime()) / 60000;
        if (diff >= 0) {
          totalDurationMins += diff;
          durationSamples++;
        }
      }
    }
    const avgResolutionMins = durationSamples > 0 ? Math.round(totalDurationMins / durationSamples) : 24;

    // 1. Trend Over Time (by YYYY-MM-DD)
    const dailyMap = new Map<string, { date: string; total: number; high: number; resolved: number }>();
    for (const r of records) {
      const day = new Date(r.createdAt).toISOString().slice(0, 10);
      const entry = dailyMap.get(day) || { date: day, total: 0, high: 0, resolved: 0 };
      entry.total++;
      if (r.urgency === 'HIGH') entry.high++;
      if (r.status === 'RESOLVED' || r.status === 'CLOSED') entry.resolved++;
      dailyMap.set(day, entry);
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

    // 3. Top Departments
    const deptMap = new Map<string, number>();
    for (const r of records) {
      const dept = r.department?.trim() || 'General / Unspecified';
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    }
    const byDepartment = Array.from(deptMap.entries())
      .map(([department, count]) => ({
        department,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 4. Status & Urgency Breakdown
    const byStatus = [
      { status: 'OPEN', count: openCount },
      { status: 'IN_PROGRESS', count: inProgressCount },
      { status: 'RESOLVED', count: records.filter((r) => r.status === 'RESOLVED').length },
      { status: 'CLOSED', count: records.filter((r) => r.status === 'CLOSED').length },
    ];

    const byUrgency = [
      { urgency: 'HIGH', count: criticalCount },
      { urgency: 'MEDIUM', count: records.filter((r) => r.urgency === 'MEDIUM').length },
      { urgency: 'LOW', count: records.filter((r) => r.urgency === 'LOW').length },
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
      trend: Array.from(dailyMap.values()),
      byCategory,
      byDepartment,
      byStatus,
      byUrgency,
    };
  }
}
