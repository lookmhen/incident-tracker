import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { parseCsvContent, parseThaiDate } from '../src/lib/csv-parser';
import { IncidentService } from '../src/lib/services/incident.service';
import { importIncidentsFromCsv } from '../scripts/import-csv';
import prisma from '../src/lib/prisma';

describe('10. CSV Parser & Yearly Monthly Trend Analytics', () => {
  it('parses CSV content with internal quotes and multiline rows properly', () => {
    const rawCsv = `"ID","Detail","Date"\n"1","Single line detail","10/8/2569"\n"2","Line one\nLine two with ""quotes""","11/8/2569 15:30"`;
    const rows = parseCsvContent(rawCsv);

    assert.equal(rows.length, 3);
    assert.equal(rows[0][0], 'ID');
    assert.equal(rows[1][1], 'Single line detail');
    assert.ok(rows[2][1].includes('Line two with "quotes"'));
  });

  it('converts Buddhist Era (BE) dates and times to UTC Gregorian correctly', () => {
    // 10 August 2569 BE -> 10 August 2026 AD
    const parsedDate = parseThaiDate('10/8/2569');
    assert.ok(parsedDate);
    assert.equal(parsedDate.getUTCFullYear(), 2026);
    assert.equal(parsedDate.getUTCMonth(), 7); // 0-indexed: 7 is August
    assert.equal(parsedDate.getUTCDate(), 10);

    // With time: 10/8/2569 16:54
    const parsedWithTime = parseThaiDate('10/8/2569 16:54');
    assert.ok(parsedWithTime);
    assert.equal(parsedWithTime.getUTCHours(), 16);
    assert.equal(parsedWithTime.getUTCMinutes(), 54);

    // ISO format: 2026-10-15
    const parsedIso = parseThaiDate('2026-10-15 08:30');
    assert.ok(parsedIso);
    assert.equal(parsedIso.getUTCFullYear(), 2026);
    assert.equal(parsedIso.getUTCMonth(), 9); // October
    assert.equal(parsedIso.getUTCDate(), 15);
    assert.equal(parsedIso.getUTCHours(), 8);
  });

  it('computes 12-month full-year trend with zero-filled empty months', async () => {
    const data = await IncidentService.getAnalyticsData({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      groupBy: 'month',
    });

    assert.equal(data.groupBy, 'month');
    assert.equal(data.trend.length, 12, 'Full year must return all 12 calendar months');
    assert.equal(data.trend[0].date, '2026-01');
    assert.equal(data.trend[0].label, 'ม.ค.');
    assert.equal(data.trend[11].date, '2026-12');
    assert.equal(data.trend[11].label, 'ธ.ค.');

    // We know August (2026-08) has imported data from Incident Report.csv
    const aug = data.trend.find((t) => t.date === '2026-08');
    assert.ok(aug && aug.total > 0, 'August 2026 should contain imported incidents');
  });

  it('re-imports exported CSV format and updates existing incidents cleanly', async () => {
    const testTicketNo = 'INC-202611-9999';

    // Cleanup before test
    await prisma.incident.deleteMany({ where: { ticketNo: testTicketNo } });

    const tmpCsv = path.join(process.cwd(), 'tests', 'fixtures', `test_export_${Date.now()}.csv`);
    const headers = [
      'Ticket No',
      'Created At',
      'Urgency',
      'Status',
      'Category',
      'Root Cause',
      'Title',
      'Description',
      'Reporter Name',
      'Department',
      'Contact Info',
      'Assigned To',
      'Resolution Type',
      'Resolution Notes',
      'Workaround Note',
      'Resolved By',
      'Closed At',
      'Related Tickets',
    ];

    const initialRow = [
      testTicketNo,
      '23/11/2569 09:00:00',
      'MEDIUM',
      'OPEN',
      'Helpdesk',
      '',
      'Initial Title',
      'Initial Problem Description',
      'Nut Tester',
      'IT Support',
      'nut@example.com',
      'Unassigned',
      '',
      '',
      '',
      '',
      '',
      '',
    ];

    const escapeCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const toCsv = (rows: string[][]) => rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');

    try {
      // 1. Initial import: creates the ticket with testTicketNo
      await fs.promises.writeFile(tmpCsv, '\uFEFF' + toCsv([headers, initialRow]), 'utf8');
      const createSummary = await importIncidentsFromCsv(tmpCsv);
      assert.equal(createSummary.imported, 1);
      assert.equal(createSummary.updated, 0);

      const created = await prisma.incident.findUnique({ where: { ticketNo: testTicketNo } });
      assert.ok(created);
      assert.equal(created.ticketNo, testTicketNo);
      assert.equal(created.title, 'Initial Title');
      assert.equal(created.status, 'OPEN');
      assert.equal(created.rootCause, null);

      // 2. Dry-run update test: should report update without committing changes
      const updatedRow = [
        testTicketNo,
        '23/11/2569 09:00:00',
        'HIGH',
        'CLOSED',
        'Helpdesk',
        'System Bug',
        'Updated Title by CSV',
        'Updated Detailed Description',
        'Nut Tester',
        'Engineering',
        'nut@example.com',
        'Admin Somchai',
        'PERMANENT',
        'Patched the server daemon',
        'Workaround used earlier',
        'Manager John',
        '23/11/2569 11:30:15',
        'INC-202611-0001, INC-202611-0002',
      ];

      await fs.promises.writeFile(tmpCsv, '\uFEFF' + toCsv([headers, updatedRow]), 'utf8');
      const drySummary = await importIncidentsFromCsv(tmpCsv, { dryRun: true });
      assert.equal(drySummary.imported, 0);
      assert.equal(drySummary.updated, 1);

      // Verify DB was NOT touched during dry-run
      const untouched = await prisma.incident.findUnique({ where: { ticketNo: testTicketNo } });
      assert.equal(untouched?.title, 'Initial Title');
      assert.equal(untouched?.status, 'OPEN');

      // 3. Real update import: updates all edited fields
      const realSummary = await importIncidentsFromCsv(tmpCsv);
      assert.equal(realSummary.imported, 0);
      assert.equal(realSummary.updated, 1);

      const updated = await prisma.incident.findUnique({ where: { ticketNo: testTicketNo } });
      assert.ok(updated);
      assert.equal(updated.ticketNo, testTicketNo);
      assert.equal(updated.title, 'Updated Title by CSV');
      assert.equal(updated.description, 'Updated Detailed Description');
      assert.equal(updated.urgency, 'HIGH');
      assert.equal(updated.status, 'CLOSED');
      assert.equal(updated.rootCause, 'System Bug');
      assert.equal(updated.department, 'Engineering');
      assert.equal(updated.assignedTo, 'Admin Somchai');
      assert.equal(updated.resolutionType, 'PERMANENT');
      assert.equal(updated.resolution, 'Patched the server daemon');
      assert.equal(updated.workaroundNote, 'Workaround used earlier');
      assert.equal(updated.resolvedBy, 'Manager John');
      assert.ok(updated.closedAt);
      assert.equal(updated.closedAt.getUTCHours(), 11);
      assert.equal(updated.closedAt.getUTCMinutes(), 30);
      assert.equal(updated.closedAt.getUTCSeconds(), 15);
      assert.deepEqual(JSON.parse(updated.relatedTickets || '[]'), ['INC-202611-0001', 'INC-202611-0002']);
    } finally {
      await fs.promises.unlink(tmpCsv).catch(() => {});
      await prisma.incident.deleteMany({ where: { ticketNo: testTicketNo } });
    }
  });
});
