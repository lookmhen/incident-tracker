import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import {
  ADMIN_COOKIE_NAME,
  AdminSession,
  normalizeRole,
  parseAdminSessionToken,
} from '@/lib/auth';

/**
 * Resolves the live session for a request, re-checking DB user role & active status
 * so role edits or account deactivation apply immediately.
 */
export async function getActiveSession(req: NextRequest): Promise<AdminSession | null> {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const parsed = await parseAdminSessionToken(token);
  if (!parsed) return null;

  if (!parsed.userId) {
    return parsed;
  }

  const dbUser = await prisma.adminUser.findUnique({
    where: { id: parsed.userId },
    select: { id: true, username: true, name: true, role: true, isActive: true },
  });
  if (!dbUser || !dbUser.isActive) {
    return null;
  }

  return {
    userId: dbUser.id,
    username: dbUser.username,
    name: dbUser.name,
    role: normalizeRole(dbUser.role),
  };
}
