import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/services/incident.service';
import { checkApiAccess } from '@/lib/api-guard';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const denied = await checkApiAccess(req);
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await req.json();

    const updated = await IncidentService.updateIncident(id, {
      title: body.title,
      description: body.description,
      category: body.category,
      categoryId: body.categoryId,
      urgency: body.urgency,
      status: body.status,
      assignedTo: body.assignedTo,
      resolution: body.resolution,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Error updating incident:', error);
    return NextResponse.json({ error: error.message || 'Failed to update incident' }, { status: 500 });
  }
}
