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

export async function GET(req: NextRequest) {
  const auth = await requireManager(req);
  if (auth.error) return auth.error;

  const users = await UserService.listUsers();
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const auth = await requireManager(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const user = await UserService.createUser({
      username: body.username,
      name: body.name,
      email: body.email,
      role: body.role,
      password: body.password,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (err: any) {
    if (err instanceof UserServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: err.message || 'Failed to create user' }, { status: 400 });
  }
}
