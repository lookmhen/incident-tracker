import { NextRequest, NextResponse } from 'next/server';
import { TeamsService } from '@/lib/services/teams.service';
import { checkApiAccess } from '@/lib/api-guard';

export async function POST(req: NextRequest) {
  const denied = await checkApiAccess(req, { requireAuth: true });
  if (denied) return denied;

  try {
    let body: any = null;
    try {
      body = await req.json();
    } catch {}

    const payload = body?.ticketNo
      ? {
          ticketNo: body.ticketNo,
          title: body.title,
          description: body.description,
          reporterName: body.reporterName,
          department: body.department,
          contactInfo: body.contactInfo || '-',
          urgency: body.urgency || 'MEDIUM',
          category: body.category,
        }
      : {
          ticketNo: 'PING-TEST-001',
          title: 'IncidentHub Test Diagnostic Pulse',
          description: 'Test ping triggered from IncidentHub Operations Console to verify Teams incoming webhook connectivity.',
          reporterName: 'SysAdmin Bot',
          department: 'IT Operations Core',
          contactInfo: 'ops@company.internal',
          urgency: 'LOW',
          category: 'Diagnostic',
        };

    const res = await TeamsService.dispatch(payload);

    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to dispatch card' }, { status: 500 });
  }
}
