import { NextResponse } from 'next/server';
import { TeamsService } from '@/lib/services/teams.service';

export async function POST() {
  try {
    const res = await TeamsService.dispatch({
      ticketNo: 'PING-TEST-001',
      title: 'IncidentHub Test Diagnostic Pulse',
      description: 'Test ping triggered from IncidentHub Operations Console to verify Teams incoming webhook connectivity.',
      reporterName: 'SysAdmin Bot',
      department: 'IT Operations Core',
      contactInfo: 'ops@company.internal',
      urgency: 'LOW',
      category: 'Diagnostic',
    });

    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to dispatch test card' }, { status: 500 });
  }
}
