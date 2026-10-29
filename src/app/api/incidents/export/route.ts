import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { IncidentService } from '@/lib/services/incident.service';
import prisma from '@/lib/prisma';

function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const where = IncidentService.buildFilterWhere({
      search: searchParams.get('search') || undefined,
      status: searchParams.get('status') || undefined,
      urgency: searchParams.get('urgency') || undefined,
      category: searchParams.get('category') || undefined,
      department: searchParams.get('department') || undefined,
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
      'Title',
      'Description',
      'Reporter Name',
      'Department',
      'Contact Info',
      'Assigned To',
      'Resolution Notes',
      'Closed At',
    ];

    const rows = incidents.map((inc) => [
      inc.ticketNo,
      new Date(inc.createdAt).toLocaleString('th-TH'),
      inc.urgency,
      inc.status,
      inc.category || 'Uncategorized',
      inc.title,
      inc.description,
      inc.reporterName,
      inc.department || '-',
      inc.contactInfo,
      inc.assignedTo || 'Unassigned',
      inc.resolution || '',
      inc.closedAt ? new Date(inc.closedAt).toLocaleString('th-TH') : '',
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
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Export failed' }, { status: 500 });
  }
}
