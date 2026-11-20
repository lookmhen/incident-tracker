import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/services/incident.service';
import { EmailService } from '@/lib/services/email.service';
import { checkApiAccess } from '@/lib/api-guard';
import { getActiveSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await checkApiAccess(req, { requireAuth: true });
  if (denied) return denied;

  try {
    const { id } = await params;
    const incident = await IncidentService.getIncidentById(id);

    if (!incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    return NextResponse.json(incident);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await checkApiAccess(req, { requireAuth: true });
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await req.json();
    const session = await getActiveSession(req);
    const nextStatus = (typeof body.status === 'string' ? body.status : '').trim().toUpperCase();
    const isClosing = ['RESOLVED', 'CLOSED'].includes(nextStatus);

    if (session && session.role !== 'MANAGER') {
      if (isClosing) {
        return NextResponse.json(
          { error: 'Only a Manager can resolve or close an incident' },
          { status: 403 }
        );
      }
      const existing = await IncidentService.getIncidentById(id);
      if (existing && ['RESOLVED', 'CLOSED'].includes((existing.status || '').trim().toUpperCase())) {
        const reporterOnlyKeys = new Set(['reporterName', 'department', 'contactInfo']);
        const sentKeys = Object.keys(body || {}).filter((k) => body[k] !== undefined);
        const isReporterOnlyEdit = sentKeys.length > 0 && sentKeys.every((k) => reporterOnlyKeys.has(k));
        if (!isReporterOnlyEdit) {
          return NextResponse.json(
            { error: 'Only a Manager can modify or reopen a closed incident' },
            { status: 403 }
          );
        }
      }
    }

    const updated = await IncidentService.updateIncident(id, {
      reporterName: body.reporterName,
      department: body.department,
      contactInfo: body.contactInfo,
      title: body.title,
      description: body.description,
      category: body.category,
      categoryId: body.categoryId,
      rootCause: body.rootCause,
      urgency: body.urgency,
      status: body.status,
      assignedTo: body.assignedTo,
      resolution: body.resolution,
      resolutionType: body.resolutionType,
      workaroundNote: body.workaroundNote,
      resolvedBy:
        (typeof body.resolvedBy === 'string' ? body.resolvedBy.trim() : body.resolvedBy) ||
        (isClosing && session ? session.name : body.resolvedBy),
      portalBaseUrl: EmailService.resolvePortalUrl(req),
      createdAt: body.createdAt,
      closedAt: body.closedAt,
      mttrExcluded: body.mttrExcluded,
      relatedTickets: body.relatedTickets,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    const msg = error?.message || 'Failed to update incident';
    if (msg.startsWith('Incident not found:')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (
      msg.includes('closedAt') ||
      msg.includes('createdAt') ||
      msg.includes('required before') ||
      msg.includes('must be claimed') ||
      msg.includes('Cannot edit incident details') ||
      msg.includes('Incident is closed') ||
      msg.includes('cannot be empty') ||
      msg.includes('Cannot reference') ||
      msg.includes('Referenced incident not found') ||
      msg.includes('Invalid relatedTickets')
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error('Error updating incident:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
