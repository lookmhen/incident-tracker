import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/services/incident.service';
import { checkApiAccess } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const options = await IncidentService.getRootCauseOptions();
    return NextResponse.json(options, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await checkApiAccess(req, { requireAuth: true });
  if (denied) return denied;

  try {
    const body = await req.json();
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'Root cause name is required' }, { status: 400 });
    }
    const updated = await IncidentService.addRootCauseOption(String(body.name));
    return NextResponse.json(updated, { status: 201 });
  } catch (error: any) {
    const msg = error?.message || 'Failed to add root cause';
    return NextResponse.json({ error: msg }, { status: msg.includes('already exists') ? 400 : 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await checkApiAccess(req, { requireAuth: true });
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name');
    if (!name) {
      return NextResponse.json({ error: 'Root cause name is required' }, { status: 400 });
    }
    const updated = await IncidentService.deleteRootCauseOption(name);
    return NextResponse.json(updated);
  } catch (error: any) {
    const msg = error?.message || 'Failed to delete root cause';
    return NextResponse.json({ error: msg }, { status: msg.includes('least one') ? 400 : 500 });
  }
}
