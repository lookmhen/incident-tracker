import { NextRequest } from 'next/server';

export const ADMIN_COOKIE_NAME = 'incidenthub_admin_session';

function getAdminSecret(): string {
  return process.env.ENCRYPTION_SECRET || 'incidenthub-aes256-enterprise-secret-key-2026';
}

export function getAdminPasscode(): string {
  return process.env.ADMIN_PASSCODE || 'admin1234';
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
 * Creates a signed session token valid for 24 hours
 */
export async function createAdminSessionToken(): Promise<string> {
  const exp = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `admin:${exp}`;
  const sig = await signPayload(payload);
  return `${payload}.${sig}`;
}

/**
 * Verifies a signed admin session token
 */
export async function verifyAdminSessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    const lastDot = token.lastIndexOf('.');
    if (lastDot === -1) return false;

    const payload = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    const [, expStr] = payload.split(':');
    const exp = parseInt(expStr, 10);

    if (isNaN(exp) || Date.now() > exp) {
      return false;
    }

    const expectedSig = await signPayload(payload);
    return sig === expectedSig;
  } catch {
    return false;
  }
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
