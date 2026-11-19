import { NextRequest, NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/session';
import { UserService, UserServiceError } from '@/lib/services/user.service';

export const dynamic = 'force-dynamic';

async function requireManager(req: NextRequest) {
  const session = await getActiveSession(req);
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (session.role !== 'MANAGER') {
    return {
      error: NextResponse.json({ error: 'Forbidden: Manager role required' }, { status: 403 }),
    };
  }
  return { session };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireManager(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const body = await req.json();
    const user = await UserService.updateUser(
      id,
      {
        name: body.name,
        email: body.email,
        role: body.role,
        password: body.password,
        isActive: body.isActive,
      },
      auth.session.userId
    );
    return NextResponse.json({ user });
  } catch (err: any) {
    if (err instanceof UserServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: err.message || 'Failed to update user' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireManager(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    await UserService.deleteUser(id, auth.session.userId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof UserServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: err.message || 'Failed to delete user' }, { status: 400 });
  }
}
