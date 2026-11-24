import prisma from '@/lib/prisma';
import { TeamsService } from './teams.service';
import { EmailService } from './email.service';
import { McpService } from './mcp.service';
import { IncidentServiceError } from './incident-errors';
import {
  RELATED_SUMMARY_SELECT,
  normalizeDepartment,
  parseRelatedTickets,
  buildFilterWhere,
  findIncidentByIdOrTicketNo,
} from './incident-shared';
import { RootCauseService } from './root-cause.service';
import { IncidentAttachmentService } from './incident-attachment.service';
import { IncidentAnalyticsService } from './incident-analytics.service';

export { IncidentServiceError } from './incident-errors';

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
  rootCause?: string;
  department?: string;
  resolutionType?: string;
  resolvedByExternal?: string;
  page?: number;
  limit?: number;
}

export class IncidentService {
  /**
   * Normalizes free-text department names (trims spaces, uppercases short ASCII codes, capitalizes lowercase ASCII words).
   */
  public static normalizeDepartment(raw?: string | null): string | null {
    return normalizeDepartment(raw);
  }

  /**
   * Returns canonical, case-insensitively deduplicated department names for autocomplete
   */
  public static async getDepartments(query?: string): Promise<string[]> {
    return IncidentAnalyticsService.getDepartments(query);
  }

  public static parseRelatedTickets(raw?: string | null): string[] {
    return parseRelatedTickets(raw);
  }

  private static async enrichRelatedInfo(incident: {
    id: string;
    ticketNo: string;
    relatedTickets?: string | null;
  }) {
    const relatedTicketNos = parseRelatedTickets(incident.relatedTickets);

    const [relatedRows, referencingRows] = await Promise.all([
      relatedTicketNos.length > 0
        ? prisma.incident.findMany({
            where: { ticketNo: { in: relatedTicketNos } },
            select: RELATED_SUMMARY_SELECT,
          })
        : Promise.resolve([]),
      prisma.incident.findMany({
        where: {
          id: { not: incident.id },
          relatedTickets: { contains: incident.ticketNo },
        },
        select: {
          ...RELATED_SUMMARY_SELECT,
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
      .filter((row) => parseRelatedTickets(row.relatedTickets).includes(incident.ticketNo))
      .map(({ relatedTickets: _raw, ...summary }) => summary);

    return {
      relatedTicketNos,
      relatedIncidents,
      referencedBy,
    };
  }

  public static async getRootCauseTree() {
    return RootCauseService.getRootCauseTree();
  }

  public static async getRootCauseOptions(): Promise<string[]> {
    return RootCauseService.getRootCauseOptions();
  }

  public static async addRootCauseOption(name: string): Promise<string[]> {
    return RootCauseService.addRootCauseOption(name);
  }

  public static async deleteRootCauseOption(name: string): Promise<string[]> {
    return RootCauseService.deleteRootCauseOption(name);
  }

  public static async getMttrExcludedIds(): Promise<Set<string>> {
    return IncidentAnalyticsService.getMttrExcludedIds();
  }

  public static async setMttrExcluded(incidentId: string, excluded: boolean): Promise<boolean> {
    return IncidentAnalyticsService.setMttrExcluded(incidentId, excluded);
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
    return IncidentAttachmentService.getUploadsRoot();
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
    return IncidentAttachmentService.saveUploadedFile(file, options);
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
            department: normalizeDepartment(data.department),
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
      const savedAttachment = await IncidentAttachmentService.saveUploadedFile(data.file, {
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

    const where = buildFilterWhere(query);

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
      IncidentAnalyticsService.getMttrExcludedIds(),
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
    const found = await findIncidentByIdOrTicketNo(idOrTicketNo);
    if (!found) return null;
    const [excludedIds, relatedInfo] = await Promise.all([
      IncidentAnalyticsService.getMttrExcludedIds(),
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
      resolvedByExternal?: boolean;
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
      throw new IncidentServiceError(`Incident not found: ${idOrTicketNo}`, 404);
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
        data.resolvedByExternal !== undefined ||
        data.relatedTickets !== undefined;
      if (hasLockedFieldMutation) {
        throw new IncidentServiceError('Incident is closed; reopen to IN_PROGRESS before editing', 400);
      }
    }

    const updatePayload: any = {};

    if (data.reporterName !== undefined) {
      const cleanedName = McpService.cleanText(data.reporterName);
      if (!cleanedName) throw new IncidentServiceError('Reporter name cannot be empty', 400);
      updatePayload.reporterName = cleanedName;
    }
    if (data.department !== undefined) {
      const cleanedDept = data.department ? McpService.cleanText(data.department) : '';
      updatePayload.department = cleanedDept || null;
    }
    if (data.contactInfo !== undefined) {
      const cleanedContact = McpService.cleanText(data.contactInfo);
      if (!cleanedContact) throw new IncidentServiceError('Contact info cannot be empty', 400);
      updatePayload.contactInfo = cleanedContact;
    }
    if (data.title !== undefined) updatePayload.title = McpService.cleanText(data.title);
    if (data.description !== undefined) updatePayload.description = McpService.cleanText(data.description);
    if (data.category !== undefined) {
      updatePayload.category = data.category?.trim() || null;
      if (data.categoryId === undefined) {
        if (updatePayload.category) {
          const matchedCat = await prisma.category.findFirst({
            where: { name: updatePayload.category },
            select: { id: true },
          });
          if (matchedCat) updatePayload.categoryId = matchedCat.id;
        } else {
          updatePayload.categoryId = null;
        }
      }
    }
    if (data.categoryId !== undefined) {
      updatePayload.categoryId = data.categoryId || null;
      if (data.category === undefined && data.categoryId) {
        const matchedCat = await prisma.category.findUnique({
          where: { id: data.categoryId },
          select: { name: true },
        });
        if (matchedCat) updatePayload.category = matchedCat.name;
      }
    }
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

    if (data.resolvedByExternal !== undefined) {
      updatePayload.resolvedByExternal = Boolean(data.resolvedByExternal);
    }

    if (data.managerComment !== undefined) {
      updatePayload.managerComment = data.managerComment ? data.managerComment.trim() || null : null;
    }

    if (data.createdAt !== undefined) {
      const parsedCreated = data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt);
      if (!data.createdAt || Number.isNaN(parsedCreated.getTime())) {
        throw new IncidentServiceError('Invalid createdAt date', 400);
      }
      updatePayload.createdAt = parsedCreated;
    }

    if (data.status !== undefined) {
      updatePayload.status = data.status.trim().toUpperCase();
      if (['RESOLVED', 'CLOSED', 'PENDING_CONFIRM'].includes(updatePayload.status)) {
        const effExternal =
          updatePayload.resolvedByExternal !== undefined
            ? updatePayload.resolvedByExternal
            : Boolean(target.resolvedByExternal);
        if (updatePayload.status === 'PENDING_CONFIRM' && !effExternal) {
          const effAssignedTo = (
            updatePayload.assignedTo !== undefined ? updatePayload.assignedTo : target.assignedTo
          )?.trim();
          if (!effAssignedTo || (currentStatus === 'OPEN' && updatePayload.assignedTo === undefined)) {
            throw new IncidentServiceError('Ticket must be claimed before requesting confirmation', 400);
          }
        }
        const effCategory = (updatePayload.category !== undefined ? updatePayload.category : target.category)?.trim();
        const effRootCause = (updatePayload.rootCause !== undefined ? updatePayload.rootCause : target.rootCause)?.trim();
        if (!effCategory || !effRootCause) {
          throw new IncidentServiceError(
            updatePayload.status === 'PENDING_CONFIRM'
              ? 'Category and Root Cause are required before requesting confirmation'
              : 'Category and Root Cause are required before closing an incident',
            400
          );
        }
        const rcParts = effRootCause.split(' > ').map((p: string) => p.trim()).filter(Boolean);
        if (!effRootCause.includes(' > ') || rcParts.length !== 2) {
          throw new IncidentServiceError(
            'Sub-branch selection is required for Root Cause (e.g. Human > User Knowledge Gap)',
            400
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
          throw new IncidentServiceError('Invalid closedAt date', 400);
        }
        if (parsed.getTime() < effectiveCreatedAt.getTime()) {
          throw new IncidentServiceError('closedAt cannot be earlier than createdAt', 400);
        }
        updatePayload.closedAt = parsed;
      }
    } else if (data.closedAt !== undefined && data.closedAt !== null && data.status === undefined) {
      throw new IncidentServiceError('Cannot set closedAt unless incident is RESOLVED or CLOSED', 400);
    } else if (updatePayload.createdAt) {
      const effectiveClosedAt: Date | null =
        updatePayload.closedAt !== undefined ? updatePayload.closedAt : target.closedAt;
      if (effectiveClosedAt && effectiveCreatedAt.getTime() > effectiveClosedAt.getTime()) {
        throw new IncidentServiceError('createdAt cannot be later than closedAt', 400);
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
          throw new IncidentServiceError('Invalid relatedTickets: expected an array of strings', 400);
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
            throw new IncidentServiceError('Cannot reference the same incident', 400);
          }
          const lookupValues = Array.from(new Set([...normalized, ...normalized.map((t) => t.toUpperCase())]));
          const existing = await prisma.incident.findMany({
            where: { ticketNo: { in: lookupValues } },
            select: { ticketNo: true },
          });
          const canonicalByUpper = new Map(existing.map((r) => [r.ticketNo.toUpperCase(), r.ticketNo]));
          const missing = normalized.filter((t) => !canonicalByUpper.has(t.toUpperCase()));
          if (missing.length > 0) {
            throw new IncidentServiceError(`Referenced incident not found: ${missing.join(', ')}`, 400);
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
      mttrExcluded = await IncidentAnalyticsService.setMttrExcluded(target.id, Boolean(data.mttrExcluded));
    } else if (updatePayload.status === 'ON_HOLD' || updatePayload.resolvedByExternal === true) {
      // Auto-exclude from MTTR whenever placed ON_HOLD or resolved by external user
      mttrExcluded = await IncidentAnalyticsService.setMttrExcluded(target.id, true);
    } else if (
      updatePayload.resolvedByExternal === false &&
      target.resolvedByExternal &&
      (updatePayload.status ?? currentStatus) !== 'ON_HOLD'
    ) {
      mttrExcluded = await IncidentAnalyticsService.setMttrExcluded(target.id, false);
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
    return IncidentAttachmentService.addAttachment(idOrTicketNo, file, kind);
  }

  /**
   * Deletes an attachment belonging to the specified incident and cleans up local upload file
   */
  public static async deleteAttachment(idOrTicketNo: string, attachmentId: string) {
    return IncidentAttachmentService.deleteAttachment(idOrTicketNo, attachmentId);
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
    return buildFilterWhere(query);
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
    return IncidentAnalyticsService.getAnalyticsData(query);
  }
}
