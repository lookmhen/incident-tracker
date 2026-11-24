import { NextRequest, NextResponse } from 'next/server';
import { RootCauseService } from '@/lib/services/root-cause.service';
import { IncidentServiceError } from '@/lib/services/incident-errors';
import { checkApiAccess } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function handleError(error: any, fallback: string) {
  if (error instanceof IncidentServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: error?.message || fallback }, { status: 500 });
}

export async function GET(req?: NextRequest) {
  try {
    const format = req ? new URL(req.url).searchParams.get('format') : null;
    const data =
      format === 'tree'
        ? await RootCauseService.getRootCauseTree()
        : await RootCauseService.getRootCauseOptions();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await checkApiAccess(req, { requireAuth: true });
  if (denied) return denied;

  try {
    const body = await req.json();
    if (body.action === 'add_parent') {
      const updated = await RootCauseService.addRootCauseParent(String(body.name || ''));
      return NextResponse.json(updated, { status: 201 });
    }
    if (body.action === 'add_child') {
      const updated = await RootCauseService.addRootCauseChild(
        String(body.parent || ''),
        String(body.name || '')
      );
      return NextResponse.json(updated, { status: 201 });
    }
    if (body.action !== undefined) {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'Root cause name is required' }, { status: 400 });
    }
    const updated = await RootCauseService.addRootCauseOption(String(body.name));
    return NextResponse.json(updated, { status: 201 });
  } catch (error: any) {
    return handleError(error, 'Failed to add root cause');
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await checkApiAccess(req, { requireAuth: true });
  if (denied) return denied;

  try {
    const body = await req.json();
    if (body.action === 'rename_parent') {
      const updated = await RootCauseService.renameRootCauseParent(
        String(body.oldName || ''),
        String(body.newName || '')
      );
      return NextResponse.json(updated);
    }
    if (body.action === 'rename_child') {
      const updated = await RootCauseService.renameRootCauseChild(
        String(body.parent || ''),
        String(body.oldName || ''),
        String(body.newName || '')
      );
      return NextResponse.json(updated);
    }
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    return handleError(error, 'Failed to rename root cause');
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await checkApiAccess(req, { requireAuth: true });
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const parent = searchParams.get('parent');
    const child = searchParams.get('child');
    const name = searchParams.get('name');

    if (parent !== null && child !== null) {
      const updated = await RootCauseService.deleteRootCauseChild(parent, child);
      return NextResponse.json(updated);
    }
    if (parent !== null) {
      const updated = await RootCauseService.deleteRootCauseParent(parent);
      return NextResponse.json(updated);
    }
    if (name) {
      const updated = await RootCauseService.deleteRootCauseOption(name);
      return NextResponse.json(updated);
    }
    return NextResponse.json({ error: 'Root cause name or parent is required' }, { status: 400 });
  } catch (error: any) {
    return handleError(error, 'Failed to delete root cause');
  }
}
