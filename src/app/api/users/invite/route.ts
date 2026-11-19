import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  createInviteToken,
  normalizeRole,
  verifyInviteToken,
} from '@/lib/auth';
import { getActiveSession } from '@/lib/session';
import { UserService, UserServiceError } from '@/lib/services/user.service';
import { EmailService } from '@/lib/services/email.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CONSUMED_INVITES_KEY = 'consumed_invites';

async function getConsumedInviteIds(): Promise<string[]> {
  const row = await prisma.integrationConfig.findUnique({ where: { key: CONSUMED_INVITES_KEY } });
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function markInviteConsumed(inviteId: string) {
  const existing = await getConsumedInviteIds();
  if (existing.includes(inviteId)) return;
  const next = [...existing.slice(-199), inviteId];
  await prisma.integrationConfig.upsert({
    where: { key: CONSUMED_INVITES_KEY },
    update: { value: JSON.stringify(next), isEnabled: true },
    create: { key: CONSUMED_INVITES_KEY, value: JSON.stringify(next), isEnabled: true },
  });
}

// Manager sends an email invite link
export async function POST(req: NextRequest) {
  const session = await getActiveSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden: Manager role required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const role = normalizeRole(body.role);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'กรุณาระบุ Email ให้ถูกต้อง' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'กรุณาระบุชื่อผู้รับเชิญ' }, { status: 400 });
    }

    const token = await createInviteToken({ email, name, role, expiresHours: 48 });
    const baseUrl = EmailService.resolvePortalUrl(req) || 'http://localhost:3000';
    const inviteUrl = `${baseUrl}/admin/invite?token=${encodeURIComponent(token)}`;

    const mailRes = await EmailService.sendUserInviteEmail({
      email,
      name,
      role,
      inviteUrl,
      invitedBy: session.name,
    });

    return NextResponse.json(
      {
        inviteUrl,
        emailSent: mailRes.success,
        emailMessage: mailRes.message,
        expiresHours: 48,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create invite' }, { status: 500 });
  }
}

// Validate invite token (public)
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token');
  const invite = await verifyInviteToken(token);
  if (!invite) {
    return NextResponse.json(
      { error: 'ลิงก์คำเชิญไม่ถูกต้องหรือหมดอายุแล้ว' },
      { status: 400 }
    );
  }

  const consumed = await getConsumedInviteIds();
  if (consumed.includes(invite.inviteId)) {
    return NextResponse.json(
      { error: 'ลิงก์คำเชิญนี้ถูกใช้งานไปแล้ว กรุณาเข้าสู่ระบบด้วยบัญชีของคุณ' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    valid: true,
    email: invite.email,
    name: invite.name,
    role: invite.role,
  });
}

// Accept invite and create account + sign in (public)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body.token || '');
    const invite = await verifyInviteToken(token);
    if (!invite) {
      return NextResponse.json(
        { error: 'ลิงก์คำเชิญไม่ถูกต้องหรือหมดอายุแล้ว' },
        { status: 400 }
      );
    }

    const consumed = await getConsumedInviteIds();
    if (consumed.includes(invite.inviteId)) {
      return NextResponse.json(
        { error: 'ลิงก์คำเชิญนี้ถูกใช้งานไปแล้ว' },
        { status: 400 }
      );
    }

    const user = await UserService.createUser({
      username: String(body.username || ''),
      name: String(body.name || invite.name || '').trim() || invite.name,
      email: invite.email,
      role: invite.role,
      password: String(body.password || ''),
    });

    await markInviteConsumed(invite.inviteId);

    const sessionToken = await createAdminSessionToken({
      userId: user.id,
      username: user.username,
      name: user.name,
      role: normalizeRole(user.role),
    });

    const res = NextResponse.json({ success: true, user }, { status: 201 });
    res.cookies.set(ADMIN_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });
    return res;
  } catch (err: any) {
    if (err instanceof UserServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: err?.message || 'Failed to accept invite' }, { status: 500 });
  }
}
