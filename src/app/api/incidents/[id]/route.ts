import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/services/incident.service';
import { IncidentServiceError } from '@/lib/services/incident-errors';
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

    return NextResponse.json(incident, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
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
    const isSubmittingConfirm = nextStatus === 'PENDING_CONFIRM';
    const existing =
      session || isClosing || isSubmittingConfirm ? await IncidentService.getIncidentById(id) : null;

    if (session && session.role === 'MANAGER') {
      const sentKeys = Object.keys(body || {}).filter((k) => body[k] !== undefined);
      const allowedManagerKeys = new Set(['status', 'managerComment']);
      if (sentKeys.length === 0 || !sentKeys.every((k) => allowedManagerKeys.has(k))) {
        return NextResponse.json(
          { error: 'Managers cannot edit incident details; reject back to Staff instead' },
          { status: 403 }
        );
      }

      if (!existing) {
        return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
      }
      const currentStatus = (existing.status || '').trim().toUpperCase();
      const canApproveOrReject =
        currentStatus === 'PENDING_CONFIRM' && (nextStatus === 'RESOLVED' || nextStatus === 'IN_PROGRESS');
      const canReopen = ['RESOLVED', 'CLOSED'].includes(currentStatus) && nextStatus === 'IN_PROGRESS';

      if (!canApproveOrReject && !canReopen) {
        return NextResponse.json(
          {
            error:
              currentStatus === 'PENDING_CONFIRM'
                ? 'Manager can only approve (RESOLVED) or reject back to Staff (IN_PROGRESS)'
                : ['RESOLVED', 'CLOSED'].includes(currentStatus)
                  ? 'Manager can only reopen closed incidents to IN_PROGRESS'
                  : 'Ticket must be submitted by Staff (PENDING_CONFIRM) before Manager action',
          },
          { status: 403 }
        );
      }
    } else if (session && session.role !== 'MANAGER') {
      if (isClosing) {
        return NextResponse.json(
          { error: 'Only a Manager can resolve or close an incident' },
          { status: 403 }
        );
      }
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

    if (body.resolvedByExternal !== undefined && typeof body.resolvedByExternal !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid resolvedByExternal: expected boolean' },
        { status: 400 }
      );
    }

    const explicitResolvedBy =
      typeof body.resolvedBy === 'string' ? body.resolvedBy.trim() : body.resolvedBy;
    const effAssignedTo =
      (typeof body.assignedTo === 'string' ? body.assignedTo.trim() : existing?.assignedTo?.trim()) || '';
    const resolvedBy =
      explicitResolvedBy ||
      (isClosing
        ? effAssignedTo || existing?.resolvedBy?.trim() || (session ? session.name : undefined)
        : isSubmittingConfirm
          ? effAssignedTo || (session ? session.name : undefined)
          : undefined);

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
      resolvedBy,
      resolvedByExternal: body.resolvedByExternal,
      managerComment: session?.role === 'MANAGER' ? body.managerComment : undefined,
      portalBaseUrl: EmailService.resolvePortalUrl(req),
      createdAt: body.createdAt,
      closedAt: body.closedAt,
      mttrExcluded: body.mttrExcluded,
      relatedTickets: body.relatedTickets,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error instanceof IncidentServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const msg = error?.message || 'Failed to update incident';
    console.error('Error updating incident:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
