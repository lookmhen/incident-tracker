import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  encryptSecret,
  decryptSecret,
  maskSecret,
  generateApiKey,
  SECRET_MASK,
} from '../src/lib/crypto';
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  verifyAdminSessionToken,
  extractRequestApiKey,
  constantTimeEqual,
  getAdminPasscode,
  getDefaultSecretWarnings,
  warnIfDefaultSecretsInProd,
} from '../src/lib/auth';
import { checkApiAccess } from '../src/lib/api-guard';
import { IntegrationService } from '../src/lib/services/integration.service';
import { GET as incidentsGetHandler } from '../src/app/api/incidents/route';
import { GET as incidentDetailGetHandler } from '../src/app/api/incidents/[id]/route';
import {
  POST as adminLoginPostHandler,
  DELETE as adminLogoutDeleteHandler,
} from '../src/app/api/auth/admin/route';

describe('1. AES-256-GCM Encryption & Secret Utilities (src/lib/crypto.ts)', () => {
  it('encrypts and decrypts ASCII, Thai UTF-8, and complex Webhook URLs accurately', () => {
    const samples = [
      'super-secret-smtp-password!@#',
      'รหัสผ่านภาษาไทยสำหรับทดสอบระบบ-2026',
      'https://default169.api.powerplatform.com:443/workflows/xyz/triggers/manual?api-version=1&sig=abc123_def',
    ];

    for (const plain of samples) {
      const cipher = encryptSecret(plain);
      assert.ok(cipher.startsWith('enc:v1:'), 'Ciphertext must have enc:v1: prefix');
      assert.notEqual(cipher, plain, 'Ciphertext must not equal plaintext');
      assert.equal(decryptSecret(cipher), plain, 'Decrypted output must match original plaintext');
    }
  });

  it('is idempotent when encryptSecret is called on an already-encrypted value', () => {
    const cipherOnce = encryptSecret('my-secret-value');
    const cipherTwice = encryptSecret(cipherOnce);
    assert.equal(cipherOnce, cipherTwice);
    assert.equal(decryptSecret(cipherTwice), 'my-secret-value');
  });

  it('handles empty strings, unencrypted legacy values, and tampered ciphertexts safely', () => {
    assert.equal(encryptSecret(''), '');
    assert.equal(decryptSecret(''), '');
    assert.equal(decryptSecret('plain-legacy-value'), 'plain-legacy-value');

    const validCipher = encryptSecret('sensitive-data');
    const tamperedCipher = validCipher.slice(0, -4) + 'ffff';
    assert.equal(decryptSecret(tamperedCipher), '', 'Tampered GCM authTag/ciphertext must fail closed to empty string');
    assert.equal(decryptSecret('enc:v1:invalid:format'), '');
  });

  it('masks secrets and generates unique ihub_live_ API keys', () => {
    assert.equal(maskSecret('my-password'), SECRET_MASK);
    assert.equal(maskSecret(''), '');
    assert.equal(maskSecret(null), '');

    const key1 = generateApiKey();
    const key2 = generateApiKey();
    assert.match(key1, /^ihub_live_[0-9a-f]{40}$/);
    assert.notEqual(key1, key2);
  });
});

describe('2. Admin Session HMAC Token & Header Extraction (src/lib/auth.ts)', () => {
  it('creates and verifies a valid HMAC-SHA256 admin session token', async () => {
    const token = await createAdminSessionToken();
    assert.ok(token.startsWith('admin:'));
    const isValid = await verifyAdminSessionToken(token);
    assert.equal(isValid, true);
  });

  it('rejects tampered, expired, or malformed session tokens', async () => {
    const validToken = await createAdminSessionToken();
    const tamperedSig = validToken.slice(0, -2) + '00';
    assert.equal(await verifyAdminSessionToken(tamperedSig), false);

    const expiredToken = `admin:${Date.now() - 60_000}.${validToken.split('.')[1]}`;
    assert.equal(await verifyAdminSessionToken(expiredToken), false);

    assert.equal(await verifyAdminSessionToken('malformed-no-dot'), false);
    assert.equal(await verifyAdminSessionToken(''), false);
    assert.equal(await verifyAdminSessionToken(null), false);
  });

  it('extracts API key from x-api-key or Authorization: Bearer headers', () => {
    const reqWithXApiKey = new NextRequest('http://localhost:3000/api/mcp/v1/context', {
      headers: { 'x-api-key': '  ihub_live_test123  ' },
    });
    assert.equal(extractRequestApiKey(reqWithXApiKey), 'ihub_live_test123');

    const reqWithBearer = new NextRequest('http://localhost:3000/api/mcp/v1/context', {
      headers: { authorization: 'Bearer ihub_live_bearer456' },
    });
    assert.equal(extractRequestApiKey(reqWithBearer), 'ihub_live_bearer456');

    const reqWithoutKey = new NextRequest('http://localhost:3000/api/mcp/v1/context');
    assert.equal(extractRequestApiKey(reqWithoutKey), null);
  });
});

describe('3. API Access Guard (src/lib/api-guard.ts)', () => {
  let initialSecurity: { mcpEnabled: boolean; enforceApiKey: boolean; apiKey: string };

  before(async () => {
    const raw = await IntegrationService.getRawConfig();
    initialSecurity = { ...raw.mcpSecurity };
  });

  after(async () => {
    await IntegrationService.saveMcpSecurityConfig({
      mcpEnabled: initialSecurity.mcpEnabled,
      enforceApiKey: initialSecurity.enforceApiKey,
    });
  });

  it('returns 503 when MCP endpoint is disabled and checkMcpEnabled is true', async () => {
    await IntegrationService.saveMcpSecurityConfig({ mcpEnabled: false, enforceApiKey: false });
    const req = new NextRequest('http://localhost:3000/api/mcp/v1/context');
    const res = await checkApiAccess(req, { checkMcpEnabled: true });
    assert.ok(res, 'Should block request when MCP is disabled');
    assert.equal(res.status, 503);
  });

  it('enforces x-api-key / Bearer token when enforceApiKey is enabled, and allows Admin cookie bypass', async () => {
    await IntegrationService.saveMcpSecurityConfig({ mcpEnabled: true, enforceApiKey: true });
    const { mcpSecurity } = await IntegrationService.getRawConfig();

    // 1. Missing key -> 401
    const unauthReq = new NextRequest('http://localhost:3000/api/mcp/v1/context');
    const unauthRes = await checkApiAccess(unauthReq, { checkMcpEnabled: true });
    assert.ok(unauthRes);
    assert.equal(unauthRes.status, 401);

    // 2. Wrong key -> 401
    const wrongKeyReq = new NextRequest('http://localhost:3000/api/mcp/v1/context', {
      headers: { 'x-api-key': 'ihub_live_wrong_key' },
    });
    const wrongKeyRes = await checkApiAccess(wrongKeyReq, { checkMcpEnabled: true });
    assert.ok(wrongKeyRes);
    assert.equal(wrongKeyRes.status, 401);

    // 3. Valid x-api-key -> allowed (null)
    const validKeyReq = new NextRequest('http://localhost:3000/api/mcp/v1/context', {
      headers: { 'x-api-key': mcpSecurity.apiKey },
    });
    const validKeyRes = await checkApiAccess(validKeyReq, { checkMcpEnabled: true });
    assert.equal(validKeyRes, null);

    // 4. Valid Admin session cookie without API key -> allowed (null)
    const adminToken = await createAdminSessionToken();
    const adminCookieReq = new NextRequest('http://localhost:3000/api/mcp/v1/context', {
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    const adminCookieRes = await checkApiAccess(adminCookieReq, { checkMcpEnabled: true });
    assert.equal(adminCookieRes, null);
  });

  it('enforces authentication on GET /api/incidents and GET /api/incidents/[id]', async () => {
    // 1. Unauthenticated -> 401
    const unauthReq = new NextRequest('http://localhost:3000/api/incidents');
    const unauthRes = await incidentsGetHandler(unauthReq);
    assert.equal(unauthRes.status, 401);

    const unauthDetailReq = new NextRequest('http://localhost:3000/api/incidents/INC-202610-001');
    const unauthDetailRes = await incidentDetailGetHandler(unauthDetailReq, {
      params: Promise.resolve({ id: 'INC-202610-001' }),
    });
    assert.equal(unauthDetailRes.status, 401);

    // 2. Admin cookie -> allows access
    const adminToken = await createAdminSessionToken();
    const adminReq = new NextRequest('http://localhost:3000/api/incidents', {
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    const adminRes = await incidentsGetHandler(adminReq);
    assert.equal(adminRes.status, 200);

    // 3. Valid API Key -> allows access
    const { mcpSecurity } = await IntegrationService.getRawConfig();
    const apiKeyReq = new NextRequest('http://localhost:3000/api/incidents', {
      headers: { 'x-api-key': mcpSecurity.apiKey },
    });
    const apiKeyRes = await incidentsGetHandler(apiKeyReq);
    assert.equal(apiKeyRes.status, 200);
  });
});

describe('4. Constant-Time Comparison & Production Default Secret Warnings (src/lib/auth.ts)', () => {
  it('compares ASCII, Thai UTF-8, empty, and mismatched-length strings in constant time', () => {
    assert.equal(constantTimeEqual('abc', 'abc'), true);
    assert.equal(constantTimeEqual('abc', 'abd'), false);
    assert.equal(constantTimeEqual('abc', 'ab'), false);
    assert.equal(constantTimeEqual('รหัสไทย', 'รหัสไทย'), true);
    assert.equal(constantTimeEqual('', ''), true);
    assert.equal(constantTimeEqual('รหัสไทย', 'รหัสอื่น'), false);
  });

  it('detects missing, placeholder, and default secrets only in production runtime', () => {
    const missingProd = getDefaultSecretWarnings({ NODE_ENV: 'production' });
    assert.equal(missingProd.length, 2);
    assert.ok(missingProd.some((w) => w.includes('ENCRYPTION_SECRET')));
    assert.ok(missingProd.some((w) => w.includes('ADMIN_PASSCODE')));

    const placeholderProd = getDefaultSecretWarnings({
      NODE_ENV: 'production',
      ENCRYPTION_SECRET: 'change-this-to-a-32-byte-secret-key',
      ADMIN_PASSCODE: 'admin1234',
    });
    assert.equal(placeholderProd.length, 2);
    assert.ok(placeholderProd.some((w) => w.includes('ENCRYPTION_SECRET')));
    assert.ok(placeholderProd.some((w) => w.includes('ADMIN_PASSCODE')));

    assert.deepEqual(
      getDefaultSecretWarnings({
        NODE_ENV: 'production',
        ENCRYPTION_SECRET: 'custom-strong-secret-key-at-least-32b',
        ADMIN_PASSCODE: 'custom-passcode',
      }),
      []
    );

    assert.deepEqual(getDefaultSecretWarnings({ NODE_ENV: 'development' }), []);
    assert.deepEqual(
      getDefaultSecretWarnings({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' }),
      []
    );
  });

  it('logs default secret warnings at most once per process via warnIfDefaultSecretsInProd', () => {
    const g = globalThis as unknown as { __incidenthubSecretWarned?: boolean };
    const prevWarned = g.__incidenthubSecretWarned;
    const prevNodeEnv = process.env.NODE_ENV;
    const prevEnc = process.env.ENCRYPTION_SECRET;
    const prevPasscode = process.env.ADMIN_PASSCODE;
    const prevPassword = process.env.ADMIN_PASSWORD;
    const prevPhase = process.env.NEXT_PHASE;
    const origWarn = console.warn;

    const logged: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
      logged.push(args);
    };

    try {
      delete g.__incidenthubSecretWarned;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.ENCRYPTION_SECRET;
      delete process.env.ADMIN_PASSCODE;
      delete process.env.ADMIN_PASSWORD;
      delete process.env.NEXT_PHASE;

      warnIfDefaultSecretsInProd();
      warnIfDefaultSecretsInProd();

      assert.equal(logged.length, 1);
      assert.ok(String(logged[0][0]).startsWith('[SECURITY WARNING]'));
    } finally {
      console.warn = origWarn;
      if (prevWarned === undefined) delete g.__incidenthubSecretWarned;
      else g.__incidenthubSecretWarned = prevWarned;
      if (prevNodeEnv === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
      else (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
      if (prevEnc === undefined) delete process.env.ENCRYPTION_SECRET;
      else process.env.ENCRYPTION_SECRET = prevEnc;
      if (prevPasscode === undefined) delete process.env.ADMIN_PASSCODE;
      else process.env.ADMIN_PASSCODE = prevPasscode;
      if (prevPassword === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = prevPassword;
      if (prevPhase === undefined) delete process.env.NEXT_PHASE;
      else process.env.NEXT_PHASE = prevPhase;
    }
  });
});

describe('5. Protocol-Aware Secure Cookie & Passcode Login (src/app/api/auth/admin/route.ts)', () => {
  it('omits Secure attribute on plain HTTP LAN login requests', async () => {
    const req = new NextRequest('http://192.168.1.10:3001/api/auth/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passcode: getAdminPasscode() }),
    });
    const res = await adminLoginPostHandler(req);
    assert.equal(res.status, 200);
    const setCookie = res.headers.get('set-cookie') || '';
    assert.ok(setCookie.includes(`${ADMIN_COOKIE_NAME}=`), 'Must set admin session cookie');
    assert.ok(!/;\s*secure\b/i.test(setCookie), `Expected no Secure flag on HTTP, got: ${setCookie}`);
  });

  it('sets Secure attribute on direct HTTPS and reverse-proxied x-forwarded-proto: https requests', async () => {
    const httpsReq = new NextRequest('https://incident.company.local/api/auth/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passcode: getAdminPasscode() }),
    });
    const httpsRes = await adminLoginPostHandler(httpsReq);
    assert.equal(httpsRes.status, 200);
    const httpsCookie = httpsRes.headers.get('set-cookie') || '';
    assert.match(httpsCookie, /;\s*secure\b/i);

    const proxiedReq = new NextRequest('http://localhost:3000/api/auth/admin', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-proto': 'https, http',
      },
      body: JSON.stringify({ passcode: getAdminPasscode() }),
    });
    const proxiedRes = await adminLoginPostHandler(proxiedReq);
    assert.equal(proxiedRes.status, 200);
    const proxiedCookie = proxiedRes.headers.get('set-cookie') || '';
    assert.match(proxiedCookie, /;\s*secure\b/i);
  });

  it('returns 401 on invalid passcode', async () => {
    const req = new NextRequest('http://192.168.1.10:3001/api/auth/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passcode: 'wrong-passcode-attempt' }),
    });
    const res = await adminLoginPostHandler(req);
    assert.equal(res.status, 401);
  });

  it('clears cookie with Max-Age=0 and Secure on DELETE over HTTPS', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/admin', {
      method: 'DELETE',
      headers: { 'x-forwarded-proto': 'https' },
    });
    const res = await adminLogoutDeleteHandler(req);
    assert.equal(res.status, 200);
    const setCookie = res.headers.get('set-cookie') || '';
    assert.match(setCookie, /max-age=0/i);
    assert.match(setCookie, /;\s*secure\b/i);
  });
});
