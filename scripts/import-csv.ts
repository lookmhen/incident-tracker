import fs from 'fs';
import path from 'path';
import prisma from '../src/lib/prisma';
import { parseCsvContent, parseThaiDate } from '../src/lib/csv-parser';
import { McpService } from '../src/lib/services/mcp.service';

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
 * CLI Script to import historical Incident Report CSV files into SQLite database
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

  const header = rows[0].map((h) => h.trim().replace(/^"|"$/g, ''));
  const idIdx = header.indexOf('ID');
  const senderIdx = header.indexOf('Sender Name');
  const dateIdx = header.indexOf('IncidentDate');
  const typeIdx = header.indexOf('Incident Type');
  const severityIdx = header.indexOf('Severity');
  const statusIdx = header.indexOf('Status');
  const detailIdx = header.indexOf('Detail');
  const rootCauseIdx = header.indexOf('Root Cause');
  const resDateIdx = header.indexOf('ResolutionDate');

  if (detailIdx === -1 || dateIdx === -1) {
    throw new Error('CSV is missing required headers: "Detail" or "IncidentDate"');
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

    const legacyId = idIdx !== -1 ? row[idIdx]?.trim() : String(i);
    const sender = senderIdx !== -1 && row[senderIdx]?.trim() ? row[senderIdx].trim() : 'Unspecified User';
    const incidentDateStr = dateIdx !== -1 ? row[dateIdx] : null;
    const rawType = typeIdx !== -1 ? row[typeIdx]?.trim() : 'General';
    const rawSeverity = severityIdx !== -1 ? row[severityIdx]?.trim().toUpperCase() : 'MEDIUM';
    const rawStatus = statusIdx !== -1 ? row[statusIdx]?.trim().toUpperCase() : 'OPEN';
    const detail = detailIdx !== -1 ? row[detailIdx]?.trim() : '';
    const rootCause = rootCauseIdx !== -1 ? row[rootCauseIdx]?.trim() : '';
    const resDateStr = resDateIdx !== -1 ? row[resDateIdx] : null;

    if (!detail) {
      skipped++;
      continue;
    }

    const createdAt = parseThaiDate(incidentDateStr) || new Date();
    const closedAt = parseThaiDate(resDateStr);

    // Map Category
    const mappedCategoryName = CATEGORY_MAP[rawType] || rawType || 'General';
    let catEntry = categoryCache.get(mappedCategoryName.toLowerCase());

    if (!catEntry && !options.dryRun) {
      const slug = mappedCategoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
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
    if (rawStatus === 'RESOLVED' || closedAt) status = 'RESOLVED';
    if (rawStatus === 'CLOSED') status = 'CLOSED';
    if (rawStatus === 'IN_PROGRESS' || rawStatus === 'IN PROGRESS') status = 'IN_PROGRESS';

    // Generate Standard IncidentHub Ticket Number
    const yyyy = createdAt.getUTCFullYear();
    const mm = String(createdAt.getUTCMonth() + 1).padStart(2, '0');
    const paddedId = legacyId ? legacyId.padStart(4, '0') : String(i).padStart(4, '0');
    const ticketNo = `INC-${yyyy}${mm}-${paddedId}`;

    // Clean title (first sentence or 100 chars)
    const cleanDetail = McpService.cleanText(detail);
    const title = cleanDetail.length > 90 ? cleanDetail.slice(0, 90) + '...' : cleanDetail;
    const cleanResolution = rootCause ? McpService.cleanText(rootCause) : null;

    if (options.dryRun) {
      imported++;
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
          title,
          description: cleanDetail,
          reporterName: sender,
          category: catEntry?.name || mappedCategoryName,
          categoryId: catEntry?.id,
          urgency,
          status,
          resolution: cleanResolution,
          createdAt,
          closedAt,
        },
      });
      updated++;
    } else {
      await prisma.incident.create({
        data: {
          ticketNo,
          title,
          description: cleanDetail,
          reporterName: sender,
          contactInfo: 'legacy-import@internal.local',
          department: 'General',
          category: catEntry?.name || mappedCategoryName,
          categoryId: catEntry?.id,
          urgency,
          status,
          resolution: cleanResolution,
          createdAt,
          closedAt,
        },
      });
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
