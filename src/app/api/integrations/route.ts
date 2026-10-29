import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { IntegrationService } from '@/lib/services/integration.service';
import { TeamsService } from '@/lib/services/teams.service';
import { EmailService } from '@/lib/services/email.service';

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const config = await IntegrationService.getMaskedConfig();
  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { section, data } = body;

    if (section === 'teams') {
      const updated = await IntegrationService.saveTeamsConfig(data);
      return NextResponse.json(updated);
    }

    if (section === 'smtp') {
      const updated = await IntegrationService.saveSmtpConfig(data);
      return NextResponse.json(updated);
    }

    if (section === 'mcp_security') {
      const updated = await IntegrationService.saveMcpSecurityConfig(data);
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Invalid configuration section' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to save settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'rotate_api_key') {
      const newKey = await IntegrationService.rotateApiKey();
      return NextResponse.json({ apiKey: newKey, message: 'API Key rotated successfully' });
    }

    if (action === 'test_teams') {
      const result = await TeamsService.dispatch(
        {
          ticketNo: 'TEST-PING-001',
          title: 'IncidentHub Webhook Diagnostic Test',
          description: 'ทดสอบการส่งแจ้งเตือนจากหน้า Integrations & Security Hub',
          reporterName: 'IT Admin Console',
          department: 'System Operations',
          contactInfo: 'admin@internal',
          urgency: 'MEDIUM',
          category: 'Diagnostic',
        },
        undefined,
        true
      );
      return NextResponse.json(result);
    }

    if (action === 'test_email') {
      const result = await EmailService.dispatch(
        {
          ticketNo: 'TEST-SMTP-001',
          title: 'IncidentHub SMTP Relay Test',
          description: 'นี่คืออีเมลทดสอบจากหน้าตั้งค่า Integrations & Security Hub เพื่อยืนยันการตั้งค่า SMTP',
          reporterName: 'IT Admin Console',
          department: 'System Operations',
          contactInfo: 'admin@internal',
          urgency: 'MEDIUM',
          category: 'Diagnostic',
        },
        true
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Action failed' }, { status: 500 });
  }
}
