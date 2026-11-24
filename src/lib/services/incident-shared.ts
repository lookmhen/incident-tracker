import prisma from '@/lib/prisma';

export const RELATED_SUMMARY_SELECT = {
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

/**
 * Normalizes free-text department names (trims spaces, uppercases short ASCII codes, capitalizes lowercase ASCII words).
 */
export function normalizeDepartment(raw?: string | null): string | null {
  const cleaned = raw?.trim().replace(/\s+/g, ' ');
  if (!cleaned) return null;
  if (/^[a-zA-Z0-9]{1,4}$/.test(cleaned)) return cleaned.toUpperCase();
  if (/^[a-z\s-]+$/.test(cleaned)) {
    return cleaned.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  return cleaned;
}

export function parseRelatedTickets(raw?: string | null): string[] {
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

/**
 * Builds filter where clause for Export and Analytics
 */
export function buildFilterWhere(query: {
  search?: string;
  status?: string;
  urgency?: string;
  category?: string;
  rootCause?: string;
  department?: string;
  resolutionType?: string;
  resolvedByExternal?: string;
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
    const rc = query.rootCause.trim();
    if (rc === 'Unspecified') {
      where.rootCause = null;
    } else if (rc.includes(' > ')) {
      where.rootCause = rc;
    } else if (rc) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [{ rootCause: rc }, { rootCause: { startsWith: `${rc} > ` } }],
        },
      ];
    }
  }
  if (query.department && query.department !== 'ALL') {
    where.department = { contains: query.department };
  }
  if (query.resolutionType && query.resolutionType.trim() && query.resolutionType.trim().toUpperCase() !== 'ALL') {
    where.resolutionType = query.resolutionType.trim().toUpperCase();
  }
  if (query.resolvedByExternal && query.resolvedByExternal.trim() && query.resolvedByExternal.trim().toUpperCase() !== 'ALL') {
    const ext = query.resolvedByExternal.trim().toLowerCase();
    if (ext === 'true' || ext === 'yes' || ext === '1') {
      where.resolvedByExternal = true;
    } else if (ext === 'false' || ext === 'no' || ext === '0') {
      where.resolvedByExternal = false;
    }
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
 * Finds an incident by internal CUID or ticketNo (with padded suffix fallback)
 */
export async function findIncidentByIdOrTicketNo(idOrTicketNo: string): Promise<any | null> {
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
