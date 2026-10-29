import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  getAdminPasscode,
  isAdminAuthenticated,
} from '@/lib/auth';

export async function GET(req: NextRequest) {
  const authenticated = await isAdminAuthenticated(req);
  return NextResponse.json({ authenticated });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const passcode = (body.passcode || '').trim();

    if (!passcode || passcode !== getAdminPasscode()) {
      return NextResponse.json({ error: 'รหัสผ่าน Admin ไม่ถูกต้อง (Invalid Admin Passcode)' }, { status: 401 });
    }

    const token = await createAdminSessionToken();
    const res = NextResponse.json({ success: true, authenticated: true });

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
