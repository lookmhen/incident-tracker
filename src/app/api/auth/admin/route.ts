import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE_NAME,
  AdminSession,
  createAdminSessionToken,
  getAdminPasscode,
  normalizeRole,
} from '@/lib/auth';
import { getActiveSession } from '@/lib/session';
import { IntegrationService } from '@/lib/services/integration.service';
import { UserService } from '@/lib/services/user.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await getActiveSession(req);
  const authenticated = Boolean(session);
  const failedNotifications = authenticated
    ? await IntegrationService.getUnresolvedFailedCount()
    : 0;
  return NextResponse.json(
    { authenticated, user: session, failedNotifications },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const identifier = String(body.email || body.username || '').trim();

    let sessionUser: AdminSession;
    let token: string;

    if (identifier) {
      const password = String(body.password || body.passcode || '');
      const authUser = await UserService.authenticate(identifier, password);
      if (!authUser) {
        return NextResponse.json(
          { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกระงับ' },
          { status: 401 }
        );
      }
      sessionUser = {
        userId: authUser.id,
        username: authUser.username,
        name: authUser.name,
        role: normalizeRole(authUser.role),
      };
      token = await createAdminSessionToken(sessionUser);
    } else {
      const passcode = String(body.passcode || body.password || '').trim();
      if (!passcode || passcode !== getAdminPasscode()) {
        return NextResponse.json(
          { error: 'รหัสผ่าน Admin ไม่ถูกต้อง (Invalid Admin Passcode)' },
          { status: 401 }
        );
      }
      sessionUser = {
        userId: null,
        username: 'admin',
        name: 'Master Admin',
        role: 'MANAGER',
      };
      token = await createAdminSessionToken();
    }

    const res = NextResponse.json({ success: true, authenticated: true, user: sessionUser });

    res.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });

    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Authentication failed' }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true, authenticated: false });
  res.cookies.delete(ADMIN_COOKIE_NAME);
  return res;
}
