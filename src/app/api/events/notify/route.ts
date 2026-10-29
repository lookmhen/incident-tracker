import { NextRequest, NextResponse } from 'next/server';
import { TeamsService } from '@/lib/services/teams.service';
import { checkApiAccess } from '@/lib/api-guard';

/**
 * GET /api/events/notify
 * Returns usage documentation and sample POST payload for this endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/events/notify',
    method: 'POST',
    description: 'Standalone API to dispatch incident events to Microsoft Teams, Power Automate, or custom Webhooks via HTTP POST.',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': '(Required when Enforce API Key is enabled in Integrations Hub)',
    },
    samplePayload: {
      detail: '[INC-202610-001] SAP Connection Failure\nรายละเอียด: เครื่องไคลเอนต์ไม่สามารถเชื่อมต่อ SAP Server ได้\nผู้แจ้ง: นายสมชาย (ฝ่ายการเงิน, 081-xxx-xxxx)',
      urgency: 'HIGH',
      incident_type: 'SAP Basis',
      webhookUrl: '(Optional: specify custom webhook url, or omit to use server default TEAMS_WEBHOOK_URL)',
    },
    curlExample: `curl -X POST http://localhost:3000/api/events/notify -H "Content-Type: application/json" -H "x-api-key: <YOUR_API_KEY>" -d '{"detail":"ทดสอบแจ้งเตือน","urgency":"HIGH","incident_type":"Network"}'`,
  });
}

/**
 * POST /api/events/notify
 * Accepts an event payload and forwards it to the configured webhook
 */
export async function POST(req: NextRequest) {
  const denied = await checkApiAccess(req);
  if (denied) return denied;

  try {
    const body = await req.json();

    if (!body || (!body.detail && !body.title && !body.description)) {
      return NextResponse.json(
        {
          error: 'Missing required field. Please provide at least "detail" (or "title" and "description").',
        },
        { status: 400 }
      );
    }

    const result = await TeamsService.dispatchEvent(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          statusCode: result.statusCode,
          error: result.message,
          responseBody: result.responseBody,
        },
        { status: result.statusCode >= 400 && result.statusCode < 600 ? result.statusCode : 502 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        statusCode: result.statusCode,
        message: result.message,
        responseBody: result.responseBody,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('API /api/events/notify error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to dispatch event',
      },
      { status: 500 }
    );
  }
}
