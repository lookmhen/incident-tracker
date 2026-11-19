import { NextRequest } from 'next/server';

export const ADMIN_COOKIE_NAME = 'incidenthub_admin_session';

export type UserRole = 'STAFF' | 'MANAGER';

export interface AdminSession {
  userId: string | null;
  username: string;
  name: string;
  role: UserRole;
}

export function normalizeRole(role?: string | null): UserRole {
  return (role || '').toUpperCase() === 'MANAGER' ? 'MANAGER' : 'STAFF';
}

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string): string {
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function getAdminSecret(): string {
  return process.env.ENCRYPTION_SECRET || 'incidenthub-aes256-enterprise-secret-key-2026';
}

export function getAdminPasscode(): string {
  return process.env.ADMIN_PASSCODE || process.env.ADMIN_PASSWORD || 'admin1234';
}

/**
 * Generates an HMAC-SHA256 signature using Web Crypto API (compatible with Edge & Node runtime)
 */
async function signPayload(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(getAdminSecret());
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Creates a signed session token valid for 24 hours.
 * Without user args, creates a Master Passcode session with MANAGER privileges.
 */
export async function createAdminSessionToken(user?: Partial<AdminSession>): Promise<string> {
  const exp = Date.now() + 24 * 60 * 60 * 1000;
  const payload = user?.username
    ? `u:${toBase64Url(
        JSON.stringify({
          userId: user.userId ?? null,
          username: user.username,
          name: user.name || user.username,
          role: normalizeRole(user.role),
          exp,
        })
      )}`
    : `admin:${exp}`;
  const sig = await signPayload(payload);
  return `${payload}.${sig}`;
}

/**
 * Parses and verifies a signed admin session token (returns session identity + role or null)
 */
export async function parseAdminSessionToken(
  token: string | undefined | null
): Promise<AdminSession | null> {
  if (!token) return null;
  try {
    const lastDot = token.lastIndexOf('.');
    if (lastDot === -1) return null;

    const payload = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    const expectedSig = await signPayload(payload);
    if (sig !== expectedSig) return null;

    if (payload.startsWith('u:')) {
      const parsed = JSON.parse(fromBase64Url(payload.slice(2)));
      if (!parsed || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) {
        return null;
      }
      return {
        userId: parsed.userId ?? null,
        username: String(parsed.username || 'staff'),
        name: String(parsed.name || parsed.username || 'Staff'),
        role: normalizeRole(parsed.role),
      };
    }

    const [, expStr] = payload.split(':');
    const exp = parseInt(expStr, 10);
    if (isNaN(exp) || Date.now() > exp) {
      return null;
    }

    return {
      userId: null,
      username: 'admin',
      name: 'Master Admin',
      role: 'MANAGER',
    };
  } catch {
    return null;
  }
}

/**
 * Verifies a signed admin session token
 */
export async function verifyAdminSessionToken(token: string | undefined | null): Promise<boolean> {
  return (await parseAdminSessionToken(token)) !== null;
}

/**
 * Checks if incoming NextRequest has a valid admin session cookie
 */
export async function isAdminAuthenticated(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return verifyAdminSessionToken(token);
}

/**
 * Extracts API key from x-api-key header or Authorization: Bearer header
 */
export function extractRequestApiKey(req: NextRequest): string | null {
  const xApiKey = req.headers.get('x-api-key')?.trim();
  if (xApiKey) return xApiKey;

  const authHeader = req.headers.get('authorization')?.trim();
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

export interface InvitePayload {
  inviteId: string;
  email: string;
  name: string;
  role: UserRole;
  exp: number;
}

/**
 * Creates an HMAC-SHA256 signed invite token (valid 48h by default) so an invited
 * user can choose their own username and password.
 */
export async function createInviteToken(params: {
  email: string;
  name: string;
  role?: string | null;
  expiresHours?: number;
}): Promise<string> {
  const exp = Date.now() + (params.expiresHours ?? 48) * 60 * 60 * 1000;
  const payloadObj: InvitePayload = {
    inviteId: crypto.randomUUID(),
    email: params.email.trim().toLowerCase(),
    name: params.name.trim(),
    role: normalizeRole(params.role),
    exp,
  };
  const payload = `inv:${toBase64Url(JSON.stringify(payloadObj))}`;
  const sig = await signPayload(payload);
  return `${payload}.${sig}`;
}

/**
 * Verifies an invite token signature and expiry.
 */
export async function verifyInviteToken(
  token: string | undefined | null
): Promise<InvitePayload | null> {
  if (!token) return null;
  try {
    const lastDot = token.lastIndexOf('.');
    if (lastDot === -1) return null;
    const payload = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    if (!payload.startsWith('inv:')) return null;
    const expectedSig = await signPayload(payload);
    if (sig !== expectedSig) return null;

    const parsed = JSON.parse(fromBase64Url(payload.slice(4)));
    if (
      !parsed ||
      typeof parsed.exp !== 'number' ||
      Date.now() > parsed.exp ||
      !parsed.inviteId ||
      !parsed.email
    ) {
      return null;
    }
    return {
      inviteId: String(parsed.inviteId),
      email: String(parsed.email),
      name: String(parsed.name || ''),
      role: normalizeRole(parsed.role),
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}
