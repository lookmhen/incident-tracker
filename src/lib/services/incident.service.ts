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
  portalBaseUrl?: string;
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
  resolutionType?: string;
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

  private static readonly MTTR_EXCLUDED_KEY = 'mttr_excluded_tickets';
  private static readonly ROOT_CAUSE_OPTIONS_KEY = 'root_cause_options';
  private static readonly DEFAULT_ROOT_CAUSES = ['Human', 'System', 'Data'];
  private static readonly RELATED_SUMMARY_SELECT = {
    id: true,
    ticketNo: true,
    title: true,
    status: true,
    category: true,
    rootCause: true,
    resolution: true,
    resolutionType: true,
    workaroundNote: true,
    createdAt: true,
    closedAt: true,
  } as const;

  public static parseRelatedTickets(raw?: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const seen = new Set<string>();
      const out: string[] = [];
      for (const item of parsed) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        out.push(trimmed);
      }
      return out;
    } catch {
      return [];
    }
  }

  private static async enrichRelatedInfo(incident: {
    id: string;
    ticketNo: string;
    relatedTickets?: string | null;
  }) {
    const relatedTicketNos = this.parseRelatedTickets(incident.relatedTickets);

    const [relatedRows, referencingRows] = await Promise.all([
      relatedTicketNos.length > 0
        ? prisma.incident.findMany({
            where: { ticketNo: { in: relatedTicketNos } },
            select: this.RELATED_SUMMARY_SELECT,
          })
        : Promise.resolve([]),
      prisma.incident.findMany({
        where: {
          id: { not: incident.id },
          relatedTickets: { contains: incident.ticketNo },
        },
        select: {
          ...this.RELATED_SUMMARY_SELECT,
          relatedTickets: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const relatedByTicket = new Map(relatedRows.map((row) => [row.ticketNo, row]));
    const relatedIncidents = relatedTicketNos
      .map((ticketNo) => relatedByTicket.get(ticketNo))
      .filter((row): row is (typeof relatedRows)[number] => Boolean(row));

    const referencedBy = referencingRows
      .filter((row) => this.parseRelatedTickets(row.relatedTickets).includes(incident.ticketNo))
      .map(({ relatedTickets: _raw, ...summary }) => summary);

    return {
      relatedTicketNos,
      relatedIncidents,
      referencedBy,
    };
  }

  public static async getRootCauseOptions(): Promise<string[]> {
    const row = await prisma.integrationConfig.findUnique({
      where: { key: this.ROOT_CAUSE_OPTIONS_KEY },
    });
    if (!row?.value) return [...this.DEFAULT_ROOT_CAUSES];
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
        if (cleaned.length > 0) return cleaned;
      }
    } catch {}
    return [...this.DEFAULT_ROOT_CAUSES];
  }

  public static async addRootCauseOption(name: string): Promise<string[]> {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) throw new Error('Root cause name is required');
    const current = await this.getRootCauseOptions();
    if (current.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      throw new Error(`Root cause "${clean}" already exists`);
    }
    const next = [...current, clean];
    await prisma.integrationConfig.upsert({
      where: { key: this.ROOT_CAUSE_OPTIONS_KEY },
      update: { value: JSON.stringify(next), isEnabled: true },
      create: { key: this.ROOT_CAUSE_OPTIONS_KEY, value: JSON.stringify(next), isEnabled: true },
    });
    return next;
  }

  public static async deleteRootCauseOption(name: string): Promise<string[]> {
    const targetLower = name.trim().toLowerCase();
    const current = await this.getRootCauseOptions();
    const next = current.filter((c) => c.toLowerCase() !== targetLower);
    if (next.length === 0) {
      throw new Error('At least one root cause option is required');
    }
    await prisma.integrationConfig.upsert({
      where: { key: this.ROOT_CAUSE_OPTIONS_KEY },
      update: { value: JSON.stringify(next), isEnabled: true },
      create: { key: this.ROOT_CAUSE_OPTIONS_KEY, value: JSON.stringify(next), isEnabled: true },
    });
    return next;
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
   * Generates a safe, sequential Ticket ID in format: INC-YYYYMM-XXX
   */
  public static async generateTicketNo(): Promise<string> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `INC-${yearMonth}-`;

    // Parse numerically instead of string DESC sort so sequences >= 1000 don't collide with '999'
    const existing = await prisma.incident.findMany({
      where: {
        ticketNo: {
          startsWith: prefix,
        },
      },
      select: {
        ticketNo: true,
      },
    });

    let maxSeq = 0;
    for (const row of existing) {
      const suffix = row.ticketNo.slice(prefix.length);
      const num = /^\d+$/.test(suffix) ? parseInt(suffix, 10) : NaN;
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }

    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  }

  /**
   * Resolves root uploads directory, honoring UPLOADS_DIR env if set
   */
  public static getUploadsRoot(): string {
    return path.resolve(process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), 'public', 'uploads'));
  }

  /**
   * Saves an uploaded buffer under YYYY/MM/<ticketNo>/ or fallback YYYY/MM/
   */
  public static async saveUploadedFile(
    file: {
      buffer: Buffer;
      fileName: string;
      fileType: string;
      fileSize: number;
    },
    options?: {
      ticketNo?: string;
      kind?: 'REPORT' | 'RESOLUTION';
      date?: Date;
    }
  ): Promise<{ fileUrl: string; fileName: string; fileType: string; fileSize: number }> {
    const uploadRoot = this.getUploadsRoot();
    const d = options?.date ?? new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const safeTicket = options?.ticketNo?.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

    const relSegments: string[] = safeTicket ? [yyyy, mm, safeTicket] : [yyyy, mm];
    const targetDir = path.join(uploadRoot, ...relSegments);

    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    const safeName = file.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const prefix = options?.kind ? `${options.kind.toLowerCase()}_` : '';
    const uniqueFileName = `${prefix}${Date.now()}_${safeName}`;
    const targetPath = path.join(targetDir, uniqueFileName);

    await fs.promises.writeFile(targetPath, file.buffer);

    // Always use POSIX forward-slashes for fileUrl in database & URLs
    const fileUrl = `/uploads/${[...relSegments, uniqueFileName].join('/')}`;

    return {
      fileUrl,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
    };
  }

  /**
   * Creates a new incident, persists attachment, and fires Teams Webhook
   */
  public static async createIncident(data: CreateIncidentDTO) {
    const cleanDesc = McpService.cleanText(data.description);
    const cleanTitle = McpService.cleanText(data.title);

    let created: any = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const ticketNo = await this.generateTicketNo();
      try {
        created = await prisma.incident.create({
          data: {
            ticketNo,
            reporterName: data.reporterName.trim(),
            department: this.normalizeDepartment(data.department),
            contactInfo: data.contactInfo.trim(),
            title: cleanTitle,
            description: cleanDesc,
            urgency: data.urgency || 'LOW',
            category: data.category?.trim() || null,
            categoryId: data.categoryId || null,
            status: 'OPEN',
          },
          include: {
            attachments: true,
            categoryRel: true,
          },
        });
        break;
      } catch (err: any) {
        // Retry on ticketNo unique collision (P2002) under concurrent inserts
        if (err?.code === 'P2002' && attempt < 9) {
          continue;
        }
        throw err;
      }
    }

    // Save attachment under YYYY/MM/<ticketNo>/ after ticketNo is finalized
    if (data.file && data.file.buffer) {
      const savedAttachment = await this.saveUploadedFile(data.file, {
        ticketNo: created.ticketNo,
        kind: 'REPORT',
        date: created.createdAt,
      });
      const attachment = await prisma.attachment.create({
        data: {
          incidentId: created.id,
          fileUrl: savedAttachment.fileUrl,
          fileName: savedAttachment.fileName,
          fileType: savedAttachment.fileType,
          fileSize: savedAttachment.fileSize,
          kind: 'REPORT',
        },
      });
      created.attachments = [attachment];
    }

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
        portalBaseUrl: data.portalBaseUrl,
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
      prisma.incident.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING_CONFIRM'] } } }),
      prisma.incident.count({ where: { urgency: 'HIGH', status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING_CONFIRM'] } } }),
      prisma.incident.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.incident.count({ where: { status: { in: ['RESOLVED', 'CLOSED'] } } }),
      prisma.notificationLog.count({ where: { channel: 'TEAMS' } }),
      prisma.notificationLog.count({ where: { channel: 'TEAMS', status: 'FAILED' } }),
    ]);

    const statusRank = (s: string) => {
      const up = (s || '').trim().toUpperCase();
      if (up === 'OPEN') return 0;
      if (up === 'IN_PROGRESS') return 1;
      if (up === 'PENDING_CONFIRM') return 2;
      if (up === 'ON_HOLD') return 3;
      return 4;
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
      if (sa < 4) {
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

    // Average resolution time (MTTR) calculation from closed records (excluding ON_HOLD / mttrExcluded)
    const [resolvedSamples, excludedIds] = await Promise.all([
      prisma.incident.findMany({
        where: { status: { in: ['RESOLVED', 'CLOSED'] }, closedAt: { not: null } },
        select: { id: true, createdAt: true, closedAt: true },
      }),
      this.getMttrExcludedIds(),
    ]);
    let totalMins = 0;
    let sampleCount = 0;
    for (const r of resolvedSamples) {
      if (excludedIds.has(r.id)) continue;
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

    if (!found) return null;
    const [excludedIds, relatedInfo] = await Promise.all([
      this.getMttrExcludedIds(),
      this.enrichRelatedInfo(found),
    ]);
    return {
      ...found,
      mttrExcluded: excludedIds.has(found.id),
      ...relatedInfo,
    };
  }

  /**
   * Updates an incident (triage category, responder, status, resolution)
   */
  public static async updateIncident(
    idOrTicketNo: string,
    data: {
      reporterName?: string;
      department?: string | null;
      contactInfo?: string;
      title?: string;
      description?: string;
      category?: string;
      categoryId?: string;
      rootCause?: string | null;
      urgency?: string;
      status?: string;
      assignedTo?: string;
      resolution?: string;
      resolutionType?: string | null;
      workaroundNote?: string | null;
      resolvedBy?: string | null;
      managerComment?: string | null;
      portalBaseUrl?: string;
      createdAt?: string | Date;
      closedAt?: string | Date | null;
      mttrExcluded?: boolean;
      relatedTickets?: string[] | null;
    }
  ) {
    const target = await this.getIncidentById(idOrTicketNo);
    if (!target) {
      throw new Error(`Incident not found: ${idOrTicketNo}`);
    }

    const currentStatus = (target.status || '').trim().toUpperCase();
    const nextStatus = data.status !== undefined ? data.status.trim().toUpperCase() : undefined;
    const isReopening = nextStatus !== undefined && !['RESOLVED', 'CLOSED'].includes(nextStatus);
    if (['RESOLVED', 'CLOSED'].includes(currentStatus) && !isReopening) {
      // One-way closed lock: only reporter metadata, SLA/close timestamps, mttrExcluded, or Reopen may change after closure
      const hasLockedFieldMutation =
        data.title !== undefined ||
        data.description !== undefined ||
        data.category !== undefined ||
        data.categoryId !== undefined ||
        data.rootCause !== undefined ||
        data.urgency !== undefined ||
        data.assignedTo !== undefined ||
        data.resolution !== undefined ||
        data.resolutionType !== undefined ||
        data.workaroundNote !== undefined ||
        data.relatedTickets !== undefined;
      if (hasLockedFieldMutation) {
        throw new Error('Incident is closed; reopen to IN_PROGRESS before editing');
      }
    }

    const updatePayload: any = {};

    if (data.reporterName !== undefined) {
      const cleanedName = McpService.cleanText(data.reporterName);
      if (!cleanedName) throw new Error('Reporter name cannot be empty');
      updatePayload.reporterName = cleanedName;
    }
    if (data.department !== undefined) {
      const cleanedDept = data.department ? McpService.cleanText(data.department) : '';
      updatePayload.department = cleanedDept || null;
    }
    if (data.contactInfo !== undefined) {
      const cleanedContact = McpService.cleanText(data.contactInfo);
      if (!cleanedContact) throw new Error('Contact info cannot be empty');
      updatePayload.contactInfo = cleanedContact;
    }
    if (data.title !== undefined) updatePayload.title = McpService.cleanText(data.title);
    if (data.description !== undefined) updatePayload.description = McpService.cleanText(data.description);
    if (data.category !== undefined) updatePayload.category = data.category;
    if (data.categoryId !== undefined) updatePayload.categoryId = data.categoryId;
    if (data.rootCause !== undefined) {
      updatePayload.rootCause = data.rootCause ? data.rootCause.trim() : null;
    }
    if (data.urgency !== undefined) updatePayload.urgency = data.urgency;
    if (data.assignedTo !== undefined) updatePayload.assignedTo = data.assignedTo;

    const rawResType =
      typeof data.resolutionType === 'string' ? data.resolutionType.trim().toUpperCase() : data.resolutionType;

    if (data.resolutionType !== undefined) {
      if (rawResType === 'WORKAROUND') {
        updatePayload.resolutionType = 'WORKAROUND';
      } else if (rawResType === 'PERMANENT') {
        updatePayload.resolutionType = 'PERMANENT';
        updatePayload.workaroundNote = null;
      } else if (rawResType === null || rawResType === '') {
        updatePayload.resolutionType = null;
        updatePayload.workaroundNote = null;
      }
    }

    if (
      data.workaroundNote !== undefined &&
      updatePayload.resolutionType !== 'PERMANENT' &&
      updatePayload.resolutionType !== null
    ) {
      const cleanedNote = data.workaroundNote ? McpService.cleanText(data.workaroundNote) : '';
      updatePayload.workaroundNote = cleanedNote || null;
    }

    if (data.resolvedBy !== undefined) {
      updatePayload.resolvedBy = data.resolvedBy ? data.resolvedBy.trim() || null : null;
    }

    if (data.managerComment !== undefined) {
      updatePayload.managerComment = data.managerComment ? data.managerComment.trim() || null : null;
    }

    if (data.createdAt !== undefined) {
      const parsedCreated = data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt);
      if (!data.createdAt || Number.isNaN(parsedCreated.getTime())) {
        throw new Error('Invalid createdAt date');
      }
      updatePayload.createdAt = parsedCreated;
    }

    if (data.status !== undefined) {
      updatePayload.status = data.status.trim().toUpperCase();
      if (['RESOLVED', 'CLOSED', 'PENDING_CONFIRM'].includes(updatePayload.status)) {
        if (updatePayload.status === 'PENDING_CONFIRM') {
          const effAssignedTo = (
            updatePayload.assignedTo !== undefined ? updatePayload.assignedTo : target.assignedTo
          )?.trim();
          if (!effAssignedTo || (currentStatus === 'OPEN' && updatePayload.assignedTo === undefined)) {
            throw new Error('Ticket must be claimed before requesting confirmation');
          }
        }
        const effCategory = (updatePayload.category !== undefined ? updatePayload.category : target.category)?.trim();
        const effRootCause = (updatePayload.rootCause !== undefined ? updatePayload.rootCause : target.rootCause)?.trim();
        if (!effCategory || !effRootCause) {
          throw new Error(
            updatePayload.status === 'PENDING_CONFIRM'
              ? 'Category and Root Cause are required before requesting confirmation'
              : 'Category and Root Cause are required before closing an incident'
          );
        }
      }

      if (['RESOLVED', 'CLOSED'].includes(updatePayload.status)) {
        if (data.closedAt === undefined) {
          updatePayload.closedAt = target.closedAt ?? new Date();
        }
        const closedResType =
          rawResType === 'WORKAROUND'
            ? 'WORKAROUND'
            : rawResType === 'PERMANENT'
              ? 'PERMANENT'
              : target.resolutionType || 'PERMANENT';
        updatePayload.resolutionType = closedResType;
        if (closedResType === 'PERMANENT') {
          updatePayload.workaroundNote = null;
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

    if (data.relatedTickets !== undefined) {
      if (data.relatedTickets === null) {
        updatePayload.relatedTickets = null;
      } else {
        if (!Array.isArray(data.relatedTickets) || !data.relatedTickets.every((t) => typeof t === 'string')) {
          throw new Error('Invalid relatedTickets: expected an array of strings');
        }
        const seen = new Set<string>();
        const normalized: string[] = [];
        for (const raw of data.relatedTickets) {
          const trimmed = raw.trim();
          const key = trimmed.toUpperCase();
          if (!trimmed || seen.has(key)) continue;
          seen.add(key);
          normalized.push(trimmed);
        }

        if (normalized.length === 0) {
          updatePayload.relatedTickets = null;
        } else {
          if (normalized.some((t) => t.toUpperCase() === target.ticketNo.toUpperCase())) {
            throw new Error('Cannot reference the same incident');
          }
          const lookupValues = Array.from(new Set([...normalized, ...normalized.map((t) => t.toUpperCase())]));
          const existing = await prisma.incident.findMany({
            where: { ticketNo: { in: lookupValues } },
            select: { ticketNo: true },
          });
          const canonicalByUpper = new Map(existing.map((r) => [r.ticketNo.toUpperCase(), r.ticketNo]));
          const missing = normalized.filter((t) => !canonicalByUpper.has(t.toUpperCase()));
          if (missing.length > 0) {
            throw new Error(`Referenced incident not found: ${missing.join(', ')}`);
          }
          const canonical = normalized.map((t) => canonicalByUpper.get(t.toUpperCase())!);
          updatePayload.relatedTickets = canonical.length > 0 ? JSON.stringify(canonical) : null;
        }
      }
    }

    const updated = await prisma.incident.update({
      where: { id: target.id },
      data: updatePayload,
      include: {
        attachments: true,
        categoryRel: true,
      },
    });

    if (updatePayload.status === 'PENDING_CONFIRM' && currentStatus !== 'PENDING_CONFIRM') {
      void EmailService.sendManagerConfirmRequest({
        ticketNo: updated.ticketNo,
        title: updated.title,
        description: updated.description,
        assignedTo: updated.assignedTo,
        resolution: updated.resolution,
        resolutionType: updated.resolutionType,
        workaroundNote: updated.workaroundNote,
        category: updated.category,
        rootCause: updated.rootCause,
        portalBaseUrl: data.portalBaseUrl,
      }).catch((err) => console.error('Manager confirm email dispatch error:', err));
    }

    let mttrExcluded = target.mttrExcluded;
    if (data.mttrExcluded !== undefined) {
      mttrExcluded = await this.setMttrExcluded(target.id, Boolean(data.mttrExcluded));
    } else if (updatePayload.status === 'ON_HOLD') {
      // Auto-exclude from MTTR whenever placed ON_HOLD so hold duration never skews SLA averages
      mttrExcluded = await this.setMttrExcluded(target.id, true);
    }

    const relatedInfo = await this.enrichRelatedInfo(updated);

    return {
      ...updated,
      mttrExcluded,
      ...relatedInfo,
    };
  }

  /**
   * Attaches an evidence ("REPORT") or resolution ("RESOLUTION") file to an existing incident
   */
  public static async addAttachment(
    idOrTicketNo: string,
    file: { buffer: Buffer; fileName: string; fileType: string; fileSize: number },
    kind: 'REPORT' | 'RESOLUTION' = 'REPORT'
  ) {
    const target = await this.getIncidentById(idOrTicketNo);
    if (!target) {
      throw new Error(`Incident not found: ${idOrTicketNo}`);
    }
    if (['RESOLVED', 'CLOSED'].includes((target.status || '').trim().toUpperCase())) {
      throw new Error('Incident is closed; reopen to IN_PROGRESS before modifying attachments');
    }

    const saved = await this.saveUploadedFile(file, {
      ticketNo: target.ticketNo,
      kind,
      date: target.createdAt,
    });
    return prisma.attachment.create({
      data: {
        incidentId: target.id,
        fileUrl: saved.fileUrl,
        fileName: saved.fileName,
        fileType: saved.fileType,
        fileSize: saved.fileSize,
        kind,
      },
    });
  }

  /**
   * Deletes an attachment belonging to the specified incident and cleans up local upload file
   */
  public static async deleteAttachment(idOrTicketNo: string, attachmentId: string) {
    const target = await this.getIncidentById(idOrTicketNo);
    if (!target) {
      throw new Error(`Incident not found: ${idOrTicketNo}`);
    }
    if (['RESOLVED', 'CLOSED'].includes((target.status || '').trim().toUpperCase())) {
      throw new Error('Incident is closed; reopen to IN_PROGRESS before modifying attachments');
    }

    const att = await prisma.attachment.findFirst({
      where: { id: attachmentId, incidentId: target.id },
    });
    if (!att) {
      throw new Error(`Attachment not found: ${attachmentId}`);
    }

    await prisma.attachment.delete({ where: { id: att.id } });

    if (att.fileUrl.startsWith('/uploads/')) {
      const uploadRoot = this.getUploadsRoot();
      const relPath = att.fileUrl.slice('/uploads/'.length);
      const segments = relPath.split('/').filter(Boolean);
      if (
        segments.length > 0 &&
        !segments.some(
          (s) => !s || s.startsWith('.') || s.includes('..') || s.includes('\\') || s.includes('\0')
        )
      ) {
        const filePath = path.resolve(uploadRoot, ...segments);
        if (filePath.startsWith(uploadRoot + path.sep)) {
          await fs.promises.unlink(filePath).catch(() => {});
        }
      }
    }
  }

  /**
   * Builds filter where clause for Export and Analytics
   */
  public static buildFilterWhere(query: {
    search?: string;
    status?: string;
    urgency?: string;
    category?: string;
    rootCause?: string;
    department?: string;
    resolutionType?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const where: any = {};
    if (query.status && query.status !== 'ALL') {
      const st = query.status.toUpperCase();
      where.status = st === 'ACTIVE' ? { in: ['OPEN', 'IN_PROGRESS', 'PENDING_CONFIRM'] } : st;
    }
    if (query.urgency && query.urgency !== 'ALL') where.urgency = query.urgency.toUpperCase();
    if (query.category && query.category !== 'ALL') {
      where.category = { contains: query.category };
    }
    if (query.rootCause && query.rootCause !== 'ALL') {
      where.rootCause =
        query.rootCause === 'Unspecified' ? null : query.rootCause.trim();
    }
    if (query.department && query.department !== 'ALL') {
      where.department = { contains: query.department };
    }
    if (query.resolutionType && query.resolutionType.trim() && query.resolutionType.trim().toUpperCase() !== 'ALL') {
      where.resolutionType = query.resolutionType.trim().toUpperCase();
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
    rootCause?: string;
    department?: string;
    resolutionType?: string;
  }) {
    const where = this.buildFilterWhere(query);
    const [records, distinctFilterRows, excludedIds, configuredRootCauses] = await Promise.all([
      prisma.incident.findMany({
        where,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.incident.findMany({
        select: { category: true, department: true, rootCause: true },
      }),
      this.getMttrExcludedIds(),
      this.getRootCauseOptions(),
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
