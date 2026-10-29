import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/services/incident.service';
import { IntegrationService } from '@/lib/services/integration.service';
import { checkApiAccess } from '@/lib/api-guard';

/**
 * GET /api/incidents/inbound
 * Returns usage documentation and sample JSON payload for external systems
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/incidents/inbound',
    method: 'POST',
    description:
      'Inbound API to create and report IT Incidents from external monitoring systems (e.g. Zabbix, Grafana, Datadog), ERP, or custom webhooks with automatic Ticket Number generation and multi-channel notifications.',
    authentication: 'Header x-api-key or Authorization: Bearer <token>',
    samplePayload: {
      title: 'Database High CPU Load Alert',
      description: 'Host db-primary-01 CPU usage exceeded 95% threshold for 5 consecutive minutes.',
      urgency: 'HIGH',
      reporterName: 'Zabbix Alerting Engine',
      department: 'Infrastructure',
      contactInfo: 'noc-alerts@internal.company',
      category: 'Database',
    },
    curlExample: `curl -X POST http://localhost:3000/api/incidents/inbound -H "Content-Type: application/json" -H "x-api-key: <YOUR_API_KEY>" -d '{"title":"High CPU Alert","description":"Server overload","urgency":"HIGH"}'`,
  });
}

/**
 * POST /api/incidents/inbound
 * Ingests external alerts/incidents with smart key mapping, stores in SQLite, and fires Teams/Email
 */
export async function POST(req: NextRequest) {
  const denied = await checkApiAccess(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    // Smart Mapping: support standard and common external monitoring keys
    const title = (
      body.title ||
      body.summary ||
      body.subject ||
      body.alertName ||
      body.name ||
      ''
    ).trim();

    const description = (
      body.description ||
      body.detail ||
      body.details ||
      body.message ||
      body.text ||
      ''
    ).trim();

    if (!title && !description) {
      return NextResponse.json(
        { error: 'Please provide at least a "title" (or "summary") and a "description" (or "detail").' },
        { status: 400 }
      );
    }

    // Map urgency from urgency / severity / priority
    const rawSeverity = String(body.urgency || body.severity || body.priority || '').toUpperCase();
    let urgency: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    if (
      rawSeverity.includes('CRITICAL') ||
      rawSeverity.includes('HIGH') ||
      rawSeverity === 'P1' ||
      rawSeverity.includes('ERROR') ||
      rawSeverity.includes('FATAL')
    ) {
      urgency = 'HIGH';
    } else if (
      rawSeverity.includes('LOW') ||
      rawSeverity === 'P3' ||
      rawSeverity.includes('INFO')
    ) {
      urgency = 'LOW';
    }

    const reporterName = (
      body.reporterName ||
      body.source ||
      body.sourceSystem ||
      body.system ||
      body.service ||
      'External Inbound System'
    ).trim();

    const department = (
      body.department ||
      body.environment ||
      body.env ||
      'Automated Systems'
    ).trim();

    const contactInfo = (
      body.contactInfo ||
      body.contact ||
      body.endpoint ||
      'Inbound API'
    ).trim();

    const category = (
      body.category ||
      body.alertType ||
      body.type ||
      'Automated Alert'
    ).trim();

    const created = await IncidentService.createIncident({
      title: title || description.slice(0, 80),
      description: description || title,
      urgency,
      reporterName,
      department,
      contactInfo,
      category,
      categoryId: body.categoryId || undefined,
    });

    // Record audit log entry
    await IntegrationService.logNotification({
      channel: 'CUSTOM_API',
      ticketNo: created.ticketNo,
      destination: 'Inbound API (POST /api/incidents/inbound)',
      status: 'SUCCESS',
      statusCode: 201,
      payload: JSON.stringify(body).slice(0, 1000),
      response: JSON.stringify({ ticketNo: created.ticketNo, status: created.status }),
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Incident successfully recorded from inbound system.',
        ticketNo: created.ticketNo,
        id: created.id,
        status: created.status,
        urgency: created.urgency,
        category: created.category,
        createdAt: created.createdAt,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[Inbound API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process inbound incident' },
      { status: 500 }
    );
  }
}
