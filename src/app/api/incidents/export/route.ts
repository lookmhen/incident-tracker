import { NextRequest, NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/session';
import { buildFilterWhere, parseRelatedTickets } from '@/lib/services/incident-shared';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(req: NextRequest) {
  if (!(await getActiveSession(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const where = buildFilterWhere({
      search: searchParams.get('search') || undefined,
      status: searchParams.get('status') || undefined,
      urgency: searchParams.get('urgency') || undefined,
      category: searchParams.get('category') || undefined,
      rootCause: searchParams.get('rootCause') || undefined,
      department: searchParams.get('department') || undefined,
      resolutionType: searchParams.get('resolutionType') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    });

    const incidents = await prisma.incident.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

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

    const rows = incidents.map((inc) => [
      inc.ticketNo,
      new Date(inc.createdAt).toLocaleString('th-TH'),
      inc.urgency,
      inc.status,
      inc.category || 'Uncategorized',
      inc.rootCause || '',
      inc.title,
      inc.description,
      inc.reporterName,
      inc.department || '-',
      inc.contactInfo,
      inc.assignedTo || 'Unassigned',
      inc.resolutionType || '',
      inc.resolution || '',
      inc.workaroundNote || '',
      inc.resolvedBy || '',
      inc.closedAt ? new Date(inc.closedAt).toLocaleString('th-TH') : '',
      parseRelatedTickets(inc.relatedTickets).join(', '),
    ]);

    const csvContent =
      '\uFEFF' + // UTF-8 BOM for Microsoft Excel Thai language support
      [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join('\r\n');

    const dateTag = new Date().toISOString().slice(0, 10);
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="incidents_report_${dateTag}.csv"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Export failed' }, { status: 500 });
  }
}
