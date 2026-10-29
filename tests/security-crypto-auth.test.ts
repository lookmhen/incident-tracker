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
} from '../src/lib/auth';
import { checkApiAccess } from '../src/lib/api-guard';
import { IntegrationService } from '../src/lib/services/integration.service';

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
});
