import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/services/incident.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const cleanId = typeof id === 'string' ? id.trim() : '';
    if (!cleanId || cleanId.length < 3) {
      return NextResponse.json({ error: 'Ticket ID is required (minimum 3 characters)' }, { status: 400 });
    }

    const inc = await IncidentService.getIncidentById(cleanId);
    if (!inc) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Public sanitized payload: strictly exclude internal notes, managerComment, contactInfo
    const publicData = {
      ticketNo: inc.ticketNo,
      title: inc.title,
      description: inc.description,
      category: inc.categoryRel?.name || inc.category || 'Uncategorized',
      urgency: inc.urgency,
      status: inc.status,
      createdAt: inc.createdAt,
      closedAt: inc.closedAt,
      resolution: inc.resolution,
      resolutionType: inc.resolutionType,
      workaroundNote: inc.workaroundNote,
    };

    return NextResponse.json(publicData, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('Error tracking incident:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve tracking information' },
      { status: 500 }
    );
  }
}
