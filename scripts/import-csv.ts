import fs from 'fs';
import path from 'path';
import prisma from '../src/lib/prisma';
import { parseCsvContent, parseThaiDate } from '../src/lib/csv-parser';
import { McpService } from '../src/lib/services/mcp.service';
import { IncidentAnalyticsService } from '../src/lib/services/incident-analytics.service';

/**
 * Category mapping from legacy system to IncidentHub categories
 */
const CATEGORY_MAP: Record<string, string> = {
  HelpDesk: 'Helpdesk',
  helpdesk: 'Helpdesk',
  SAP: 'SAP Basis',
  sap: 'SAP Basis',
  'Network Issue': 'Network',
  Network: 'Network',
  network: 'Network',
  'Interface apps': 'Interface',
  Interface: 'Interface',
  interface: 'Interface',
  Server: 'Server',
  server: 'Server',
};

/**
 * CLI Script to import historical Incident Report CSV files or re-import exported CSV files
 * Usage:
 *   npx tsx scripts/import-csv.ts [filePath] [--dry-run]
 */
export async function importIncidentsFromCsv(filePath: string, options: { dryRun?: boolean } = {}) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found at path: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf8');
  const rows = parseCsvContent(content);

  if (rows.length < 2) {
    console.log('CSV file is empty or only contains headers.');
    return { total: 0, imported: 0, updated: 0, skipped: 0 };
  }

  const header = rows[0].map((h) =>
    h
      .trim()
      .replace(/^\ufeff/, '')
      .replace(/^"|"$/g, '')
  );

  const findCol = (candidates: string[]) => {
    const lowerCandidates = candidates.map((c) => c.toLowerCase());
    return header.findIndex((h) => lowerCandidates.includes(h.toLowerCase()));
  };

  const idIdx = findCol(['Ticket No', 'TicketNo', 'Ticket ID', 'TicketId', 'ID', 'No']);
  const senderIdx = findCol(['Reporter Name', 'Reporter', 'Sender Name', 'Sender', 'ผู้แจ้ง', 'Name']);
  const dateIdx = findCol(['Created At', 'CreatedAt', 'IncidentDate', 'Incident Date', 'Date', 'วันที่']);
  const typeIdx = findCol(['Category', 'Incident Type', 'Type', 'หมวดหมู่']);
  const severityIdx = findCol(['Urgency', 'Severity', 'ความเร่งด่วน']);
  const statusIdx = findCol(['Status', 'สถานะ']);
  const titleIdx = findCol(['Title', 'หัวข้อ', 'เรื่อง']);
  const detailIdx = findCol(['Description', 'Detail', 'Details', 'รายละเอียด', 'Problem', 'Summary']);
  const rootCauseIdx = findCol(['Root Cause', 'RootCause', 'สาเหตุ']);
  const resolutionIdx = findCol(['Resolution Notes', 'ResolutionNotes', 'Resolution', 'Solution', 'วิธีแก้ไข']);
  const resTypeIdx = findCol(['Resolution Type', 'ResolutionType', 'ประเภทการแก้ไข']);
  const workaroundIdx = findCol(['Workaround Note', 'WorkaroundNote']);
  const resolvedByIdx = findCol(['Resolved By', 'ResolvedBy', 'ผู้ปิดงาน']);
  const resDateIdx = findCol(['Closed At', 'ClosedAt', 'ResolutionDate', 'Resolution Date', 'Resolved Date', 'Closed Date', 'วันที่แก้ไข', 'วันที่ปิด']);
  const deptIdx = findCol(['Department', 'Dept', 'แผนก']);
  const contactIdx = findCol(['Contact Info', 'ContactInfo', 'Contact', 'Email', 'เบอร์ติดต่อ']);
  const assignedToIdx = findCol(['Assigned To', 'AssignedTo', 'ผู้รับผิดชอบ']);
  const relatedTicketsIdx = findCol(['Related Tickets', 'RelatedTickets', 'ตั๋วที่เกี่ยวข้อง']);
  const externalUserIdx = findCol(['External User', 'ExternalUser', 'Resolved By External']);

  if (detailIdx === -1 && titleIdx === -1) {
    throw new Error('CSV is missing required description or title header');
  }

  // Pre-load or ensure categories in database
  const existingCategories = await prisma.category.findMany();
  const categoryCache = new Map<string, { id: string; name: string }>();
  for (const c of existingCategories) {
    categoryCache.set(c.name.toLowerCase(), { id: c.id, name: c.name });
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  console.log(`\nStarting CSV Import from: ${path.basename(resolvedPath)}`);
  console.log(`Total rows detected: ${rows.length - 1} records\n`);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || (row.length === 1 && !row[0].trim())) {
      continue;
    }

    const rawId = idIdx !== -1 ? row[idIdx]?.trim() : '';
    const detail = detailIdx !== -1 ? row[detailIdx]?.trim() : '';
    const rawTitle = titleIdx !== -1 ? row[titleIdx]?.trim() : '';

    if (!detail && !rawTitle) {
      skipped++;
      continue;
    }

    const cleanDetail = detail ? McpService.cleanText(detail) : McpService.cleanText(rawTitle);
    const cleanTitle = rawTitle
      ? McpService.cleanText(rawTitle)
      : (cleanDetail.length > 90 ? cleanDetail.slice(0, 90) + '...' : cleanDetail);

    const sender = senderIdx !== -1 && row[senderIdx]?.trim() ? row[senderIdx].trim() : 'Unspecified User';
    const incidentDateStr = dateIdx !== -1 ? row[dateIdx] : null;
    const rawType = typeIdx !== -1 ? row[typeIdx]?.trim() : 'General';
    const rawSeverity = severityIdx !== -1 ? row[severityIdx]?.trim().toUpperCase() : 'MEDIUM';
    const rawStatus = statusIdx !== -1 ? row[statusIdx]?.trim().toUpperCase() : 'OPEN';
    const rootCause = rootCauseIdx !== -1 ? row[rootCauseIdx]?.trim() || null : undefined;
    const rawResolution = resolutionIdx !== -1 ? row[resolutionIdx]?.trim() : '';
    const cleanResolution = rawResolution ? McpService.cleanText(rawResolution) : (resolutionIdx !== -1 ? null : undefined);

    const rawResType = resTypeIdx !== -1 ? row[resTypeIdx]?.trim().toUpperCase() : '';
    const resolutionType = ['PERMANENT', 'WORKAROUND'].includes(rawResType)
      ? rawResType
      : (resTypeIdx !== -1 ? null : undefined);

    const workaroundNote = workaroundIdx !== -1 ? row[workaroundIdx]?.trim() || null : undefined;
    const resolvedBy = resolvedByIdx !== -1 ? row[resolvedByIdx]?.trim() || null : undefined;

    let resolvedByExternal: boolean | undefined = undefined;
    if (externalUserIdx !== -1) {
      const rawExt = (row[externalUserIdx] || '').trim().toLowerCase();
      if (['yes', 'true', '1', 'external'].includes(rawExt)) {
        resolvedByExternal = true;
      } else if (['no', 'false', '0', ''].includes(rawExt)) {
        resolvedByExternal = false;
      }
    }

    const rawAssigned = assignedToIdx !== -1 ? row[assignedToIdx]?.trim() : '';
    const assignedTo = rawAssigned && rawAssigned !== 'Unassigned'
      ? rawAssigned
      : (assignedToIdx !== -1 ? null : undefined);

    const rawDept = deptIdx !== -1 ? row[deptIdx]?.trim() : '';
    const department = rawDept && rawDept !== '-'
      ? rawDept
      : (deptIdx !== -1 ? null : 'General');

    const rawContact = contactIdx !== -1 ? row[contactIdx]?.trim() : '';
    const contactInfo = rawContact || (contactIdx !== -1 ? '' : 'legacy-import@internal.local');

    const resDateStr = resDateIdx !== -1 ? row[resDateIdx] : null;
    const createdAt = parseThaiDate(incidentDateStr) || (dateIdx === -1 ? null : new Date());
    const closedAt = resDateStr ? parseThaiDate(resDateStr) : (resDateIdx !== -1 ? null : undefined);

    let relatedTickets: string | null | undefined = undefined;
    if (relatedTicketsIdx !== -1) {
      const rawRel = row[relatedTicketsIdx]?.trim();
      if (!rawRel) {
        relatedTickets = null;
      } else {
        const tickets = rawRel
          .split(',')
          .map((t) => t.trim().toUpperCase())
          .filter((t) => /^INC-\d{6}-\d+$/i.test(t));
        relatedTickets = tickets.length > 0 ? JSON.stringify(tickets) : null;
      }
    }

    // Map Category
    const mappedCategoryName = CATEGORY_MAP[rawType] || rawType || 'General';
    let catEntry = categoryCache.get(mappedCategoryName.toLowerCase());

    if (!catEntry && !options.dryRun && mappedCategoryName && mappedCategoryName !== 'Uncategorized') {
      const rawSlug = mappedCategoryName.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '-').replace(/^-+|-+$/g, '');
      const slug = rawSlug || `cat-${Date.now()}`;
      const createdCat = await prisma.category.upsert({
        where: { slug },
        update: { name: mappedCategoryName },
        create: {
          name: mappedCategoryName,
          slug,
          description: `Imported category for ${mappedCategoryName}`,
          color: '#64748b',
          isActive: true,
        },
      });
      catEntry = { id: createdCat.id, name: createdCat.name };
      categoryCache.set(mappedCategoryName.toLowerCase(), catEntry);
    }

    // Map Urgency
    let urgency = 'MEDIUM';
    if (rawSeverity === 'LOW') urgency = 'LOW';
    if (rawSeverity === 'HIGH' || rawSeverity === 'CRITICAL') urgency = 'HIGH';

    // Map Status
    let status = 'OPEN';
    const VALID_STATUSES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'PENDING_CONFIRM', 'RESOLVED', 'CLOSED'];
    if (VALID_STATUSES.includes(rawStatus)) {
      status = rawStatus;
    } else if (rawStatus === 'IN PROGRESS') {
      status = 'IN_PROGRESS';
    } else if (rawStatus === 'PENDING CONFIRM') {
      status = 'PENDING_CONFIRM';
    } else if (rawStatus === 'ON HOLD') {
      status = 'ON_HOLD';
    } else if (closedAt) {
      status = 'RESOLVED';
    }

    // Determine Ticket Number
    let ticketNo: string;
    if (rawId && /^INC-\d{6}-\d+$/i.test(rawId)) {
      ticketNo = rawId.toUpperCase();
    } else {
      const d = createdAt || new Date();
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const paddedId = rawId ? rawId.padStart(4, '0') : String(i).padStart(4, '0');
      ticketNo = `INC-${yyyy}${mm}-${paddedId}`;
    }

    if (options.dryRun) {
      const existing = await prisma.incident.findUnique({ where: { ticketNo } });
      if (existing) {
        updated++;
      } else {
        imported++;
      }
      continue;
    }

    // Check if ticket already exists
    const existing = await prisma.incident.findUnique({
      where: { ticketNo },
    });

    if (existing) {
      await prisma.incident.update({
        where: { ticketNo },
        data: {
          title: cleanTitle,
          description: cleanDetail,
          reporterName: sender !== 'Unspecified User' ? sender : existing.reporterName,
          department: department !== undefined ? department : existing.department,
          contactInfo: contactInfo !== undefined ? contactInfo : existing.contactInfo,
          category: catEntry?.name || (mappedCategoryName !== 'Uncategorized' ? mappedCategoryName : null) || existing.category,
          categoryId: catEntry?.id ?? existing.categoryId,
          urgency,
          status,
          rootCause: rootCause !== undefined ? rootCause : existing.rootCause,
          resolution: cleanResolution !== undefined ? cleanResolution : existing.resolution,
          resolutionType: resolutionType !== undefined ? resolutionType : existing.resolutionType,
          workaroundNote: workaroundNote !== undefined ? workaroundNote : existing.workaroundNote,
          assignedTo: assignedTo !== undefined ? assignedTo : existing.assignedTo,
          resolvedBy: resolvedBy !== undefined ? resolvedBy : existing.resolvedBy,
          resolvedByExternal: resolvedByExternal !== undefined ? resolvedByExternal : existing.resolvedByExternal,
          relatedTickets: relatedTickets !== undefined ? relatedTickets : existing.relatedTickets,
          createdAt: createdAt || existing.createdAt,
          closedAt: closedAt !== undefined ? closedAt : existing.closedAt,
        },
      });
      if (resolvedByExternal === true || status === 'ON_HOLD') {
        await IncidentAnalyticsService.setMttrExcluded(existing.id, true);
      } else if (resolvedByExternal === false && existing.resolvedByExternal && status !== 'ON_HOLD') {
        await IncidentAnalyticsService.setMttrExcluded(existing.id, false);
      }
      updated++;
    } else {
      const created = await prisma.incident.create({
        data: {
          ticketNo,
          title: cleanTitle,
          description: cleanDetail,
          reporterName: sender,
          contactInfo: contactInfo || 'legacy-import@internal.local',
          department: department || 'General',
          category: catEntry?.name || (mappedCategoryName !== 'Uncategorized' ? mappedCategoryName : null),
          categoryId: catEntry?.id,
          urgency,
          status,
          rootCause: rootCause || null,
          resolution: cleanResolution || null,
          resolutionType: resolutionType || null,
          workaroundNote: workaroundNote || null,
          assignedTo: assignedTo || null,
          resolvedBy: resolvedBy || null,
          resolvedByExternal: resolvedByExternal ?? false,
          relatedTickets: relatedTickets || null,
          createdAt: createdAt || new Date(),
          closedAt: closedAt || null,
        },
      });
      if (created.resolvedByExternal || status === 'ON_HOLD') {
        await IncidentAnalyticsService.setMttrExcluded(created.id, true);
      }
      imported++;
    }
  }

  const summary = {
    total: rows.length - 1,
    imported,
    updated,
    skipped,
  };

  console.log(`Import finished:`);
  console.log(`- Created: ${imported} records`);
  console.log(`- Updated: ${updated} records`);
  console.log(`- Skipped: ${skipped} empty records\n`);

  return summary;
}

// Execute when invoked directly from CLI
if (require.main === module || process.argv[1]?.endsWith('import-csv.ts') || process.argv[1]?.endsWith('import-csv.js')) {
  const fileArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'Incident Report.csv';
  const dryRun = process.argv.includes('--dry-run');

  importIncidentsFromCsv(fileArg, { dryRun })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Import failed with error:', err.message);
      process.exit(1);
    });
}
