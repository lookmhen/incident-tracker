import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { IntegrationService } from '@/lib/services/integration.service';
import { TeamsService } from '@/lib/services/teams.service';
import { EmailService } from '@/lib/services/email.service';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel') || 'ALL';
  const status = searchParams.get('status') || 'ALL';

  const logs = await IntegrationService.getLogs({ channel, status, limit: 100 });
  return NextResponse.json({ logs });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { logId } = body;

    const log = await prisma.notificationLog.findUnique({ where: { id: logId } });
    if (!log) {
      return NextResponse.json({ error: 'Log entry not found' }, { status: 404 });
    }

    // Attempt to find ticket to resend accurate payload
    const incident = log.ticketNo
      ? await prisma.incident.findUnique({
          where: { ticketNo: log.ticketNo },
          include: { attachments: true },
        })
      : null;

    if (log.channel === 'EMAIL') {
      const res = await EmailService.dispatch(
        {
          ticketNo: incident?.ticketNo || log.ticketNo || 'RESEND-001',
          title: incident?.title || 'Resent Notification',
          description: incident?.description || log.payload || 'Resent from Delivery Logs',
          reporterName: incident?.reporterName || 'System Resend',
          department: incident?.department || '-',
          contactInfo: incident?.contactInfo || '-',
          urgency: incident?.urgency || 'MEDIUM',
          category: incident?.category || 'General IT',
          attachmentUrl: incident?.attachments?.[0]?.fileUrl || null,
        },
        true
      );
      return NextResponse.json(res);
    }

    // Teams or Custom API resend
    const res = await TeamsService.dispatch(
      {
        ticketNo: incident?.ticketNo || log.ticketNo || 'RESEND-001',
        title: incident?.title || 'Resent Notification',
        description: incident?.description || 'Resent from Delivery Logs',
        reporterName: incident?.reporterName || 'System Resend',
        department: incident?.department || '-',
        contactInfo: incident?.contactInfo || '-',
        urgency: incident?.urgency || 'MEDIUM',
        category: incident?.category || 'General IT',
      },
      undefined,
      true
    );
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Resend failed' }, { status: 500 });
  }
}
