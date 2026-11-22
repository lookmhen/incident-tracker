# Production Security Hardening (Task A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden runtime secret warnings, constant-time token/key comparisons, protocol-aware `Secure` cookies, and duplicate upload route cleanup without breaking HTTP LAN access, existing SQLite encrypted rows, or IT Admin (`STAFF`/`MANAGER`) access.

**Architecture:** Keep `src/lib/auth.ts` free of Node-only imports so `src/proxy.ts` remains Edge-compatible; centralize Edge-safe `constantTimeEqual` and `getDefaultSecretWarnings` / `warnIfDefaultSecretsInProd` in `src/lib/auth.ts` for reuse across `src/lib/crypto.ts`, `src/lib/api-guard.ts`, and `src/app/api/auth/admin/route.ts`. Remove the legacy duplicate `src/app/api/uploads/[filename]/route.ts` so `src/app/api/uploads/[...path]/route.ts` serves all upload paths consistently with `UPLOADS_DIR`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Web Crypto API + Node `crypto`, Node `node:test` + `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-22-security-hardening-design.md`

## Global Constraints
- Must NOT restrict `/api/integrations`, `/api/categories`, or `/api/root-causes` to `MANAGER`-only; IT Admins (`STAFF` and `MANAGER`) keep existing access.
- Must NOT add in-app IP rate limiting on login or tracking routes.
- Must NOT crash or throw when default secrets are used in `NODE_ENV=production` or during `next build` / `npm test`.
- `src/lib/auth.ts` must remain Edge-runtime compatible (Web Crypto / `TextEncoder` only; no Node `crypto` import).
- Cookie `secure` must only be `true` when the request arrives over HTTPS (`req.nextUrl.protocol === 'https:'` or `x-forwarded-proto` is `https`) so plain HTTP LAN deployments keep working.

## Review Focus
- Comma-separated `x-forwarded-proto` headers (e.g. `"https, http"` from multi-hop reverse proxies): must inspect the first trimmed lowercase entry rather than strict string equality on the whole header.
- Constant-time comparison with different-length or multi-byte UTF-8 strings (e.g. Thai passcodes or short API keys): `constantTimeEqual` must encode via `TextEncoder` and compare byte lengths without leaking prefix match timing.
- Production build phase (`NEXT_PHASE === 'phase-production-build'`): `warnIfDefaultSecretsInProd()` must NOT spam warnings during `docker build` / `npm run build`, and at runtime must log at most once per process.
- Legacy single-segment `/uploads/<file>` URLs when `UPLOADS_DIR` is configured: deleting `[filename]/route.ts` must still allow `[...path]/route.ts` to serve single-segment filenames from `UPLOADS_DIR` as well as nested `YYYY/MM/ticketNo/...` files.
- Logout (`DELETE /api/auth/admin`) over HTTPS: clearing the session cookie must match `secure: isHttpsRequest(req)` so HTTPS browsers actually drop the cookie.

---

### Task 1: Edge-Safe Constant-Time Comparison & Default Secret Warnings (`src/lib/auth.ts`, `src/lib/crypto.ts`, `src/lib/api-guard.ts`)

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/crypto.ts`
- Modify: `src/lib/api-guard.ts`
- Test: `tests/security-crypto-auth.test.ts`

**Interfaces:**
- Produces (from `src/lib/auth.ts`):
  - `export const DEFAULT_ENCRYPTION_SECRET = 'incidenthub-aes256-enterprise-secret-key-2026'`
  - `export const PLACEHOLDER_ENCRYPTION_SECRET = 'change-this-to-a-32-byte-secret-key'`
  - `export const DEFAULT_ADMIN_PASSCODE = 'admin1234'`
  - `export function constantTimeEqual(a: string, b: string): boolean`
  - `export function getDefaultSecretWarnings(env?: Record<string, string | undefined>): string[]`
  - `export function warnIfDefaultSecretsInProd(): void`
- Consumes: `constantTimeEqual` and `warnIfDefaultSecretsInProd` in `src/lib/crypto.ts` and `src/lib/api-guard.ts`.

- [ ] **Step 1: Write failing tests in `tests/security-crypto-auth.test.ts`**

Add assertions testing:
1. `constantTimeEqual('abc', 'abc') === true`, `constantTimeEqual('abc', 'abd') === false`, `constantTimeEqual('abc', 'ab') === false`, `constantTimeEqual('รหัสไทย', 'รหัสไทย') === true`, `constantTimeEqual('', '') === true`.
2. `getDefaultSecretWarnings({ NODE_ENV: 'production' })` returns warnings for both `ENCRYPTION_SECRET` and `ADMIN_PASSCODE`.
3. `getDefaultSecretWarnings({ NODE_ENV: 'production', ENCRYPTION_SECRET: 'change-this-to-a-32-byte-secret-key', ADMIN_PASSCODE: 'admin1234' })` returns warnings for both.
4. `getDefaultSecretWarnings({ NODE_ENV: 'production', ENCRYPTION_SECRET: 'custom-strong-secret-key-at-least-32b', ADMIN_PASSCODE: 'custom-passcode' })` returns `[]`.
5. `getDefaultSecretWarnings({ NODE_ENV: 'development' })` and `getDefaultSecretWarnings({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' })` return `[]`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/security-crypto-auth.test.ts`
Expected: FAIL because `constantTimeEqual` and `getDefaultSecretWarnings` are not exported yet.

- [ ] **Step 3: Implement `constantTimeEqual`, `getDefaultSecretWarnings`, and `warnIfDefaultSecretsInProd` in `src/lib/auth.ts`, and wire them into `src/lib/auth.ts`, `src/lib/crypto.ts`, and `src/lib/api-guard.ts`**

- In `src/lib/auth.ts`:
  - Export `DEFAULT_ENCRYPTION_SECRET`, `PLACEHOLDER_ENCRYPTION_SECRET`, `DEFAULT_ADMIN_PASSCODE`.
  - Implement `constantTimeEqual(a: string, b: string): boolean` using `TextEncoder` (`Uint8Array`) XOR across `Math.max(bytesA.length, bytesB.length)` with `diff = bytesA.length ^ bytesB.length`.
  - Implement `getDefaultSecretWarnings(env: Record<string, string | undefined> = process.env): string[]` returning `[]` unless `env.NODE_ENV === 'production'` and `env.NEXT_PHASE !== 'phase-production-build'`. Check `ENCRYPTION_SECRET` (missing, blank, `DEFAULT_ENCRYPTION_SECRET`, or `PLACEHOLDER_ENCRYPTION_SECRET`) and `ADMIN_PASSCODE || ADMIN_PASSWORD` (missing, blank, or `DEFAULT_ADMIN_PASSCODE`).
  - Implement `warnIfDefaultSecretsInProd(): void` guarded by a `globalThis.__incidenthubSecretWarned` flag so `console.warn('[SECURITY WARNING] ...')` logs at most once per process.
  - Call `warnIfDefaultSecretsInProd()` inside `getAdminSecret()` and `getAdminPasscode()`, and replace `sig !== expectedSig` in `parseAdminSessionToken` and `verifyInviteToken` with `!constantTimeEqual(sig, expectedSig)`.
- In `src/lib/crypto.ts`:
  - Import `DEFAULT_ENCRYPTION_SECRET`, `warnIfDefaultSecretsInProd` from `./auth`.
  - Call `warnIfDefaultSecretsInProd()` in `getEncryptionKey()` and use `DEFAULT_ENCRYPTION_SECRET` as fallback.
- In `src/lib/api-guard.ts`:
  - Import `constantTimeEqual` from `@/lib/auth`.
  - Replace `key === mcpSecurity.apiKey` with `constantTimeEqual(key, mcpSecurity.apiKey)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/security-crypto-auth.test.ts`
Expected: PASS (all assertions in security-crypto-auth pass).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/crypto.ts src/lib/api-guard.ts tests/security-crypto-auth.test.ts
git commit -m "feat(security): add constant-time auth checks and prod default secret warnings"
```

---

### Task 2: Protocol-Aware `Secure` Cookie & Constant-Time Passcode Check (`src/app/api/auth/admin/route.ts`)

**Files:**
- Modify: `src/app/api/auth/admin/route.ts`
- Test: `tests/security-crypto-auth.test.ts`

**Interfaces:**
- Consumes: `constantTimeEqual` from `@/lib/auth`.
- Produces (from `src/app/api/auth/admin/route.ts`): `isHttpsRequest(req: NextRequest): boolean` (internal helper or exported if unit-tested directly, tested via `POST` and `DELETE` `Set-Cookie` headers).

- [ ] **Step 1: Write failing tests in `tests/security-crypto-auth.test.ts`**

Add tests invoking `POST` and `DELETE` on `src/app/api/auth/admin/route.ts`:
1. HTTP request (`http://192.168.1.10:3001/api/auth/admin`, valid passcode) sets cookie WITHOUT `Secure` attribute (verified in `res.headers.get('set-cookie')`), so HTTP LAN logins work.
2. HTTPS request (`https://incident.company.local/api/auth/admin`) AND reverse-proxied request (`http://localhost:3000/api/auth/admin` with header `x-forwarded-proto: https, http`) BOTH set `Secure` on the session cookie.
3. Invalid passcode returns `401`.
4. `DELETE` over HTTPS (`x-forwarded-proto: https`) sets `Max-Age=0` and `Secure` so HTTPS browsers drop the cookie.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/security-crypto-auth.test.ts`
Expected: FAIL because `Set-Cookie` currently lacks `Secure` on HTTPS / `x-forwarded-proto: https`.

- [ ] **Step 3: Update `src/app/api/auth/admin/route.ts`**

- Implement `isHttpsRequest(req: NextRequest): boolean`:
  ```ts
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  return forwardedProto === 'https' || req.nextUrl.protocol === 'https:';
  ```
- Replace `passcode !== getAdminPasscode()` with `!constantTimeEqual(passcode, getAdminPasscode())`.
- Set `secure: isHttpsRequest(req)` on `res.cookies.set(ADMIN_COOKIE_NAME, token, { ... })` in `POST`.
- Update `DELETE(req: NextRequest)` to clear cookie with `{ httpOnly: true, sameSite: 'lax', secure: isHttpsRequest(req), path: '/', maxAge: 0 }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/security-crypto-auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/admin/route.ts tests/security-crypto-auth.test.ts
git commit -m "feat(auth): use protocol-aware secure cookie and constant-time passcode verify"
```

---

### Task 3: Remove Duplicate Legacy Upload Route (`src/app/api/uploads/[filename]/route.ts`)

**Files:**
- Delete: `src/app/api/uploads/[filename]/route.ts`
- Test: `tests/uploads-route.test.ts`

**Interfaces:**
- Verifies `src/app/api/uploads/[...path]/route.ts` (`GET`) serves single-segment filenames from custom `process.env.UPLOADS_DIR` when `[filename]/route.ts` is removed.

- [ ] **Step 1: Add test in `tests/uploads-route.test.ts` verifying `UPLOADS_DIR` single-segment serving and route uniqueness**

Add a test in `tests/uploads-route.test.ts` that:
1. Creates a temporary `UPLOADS_DIR`, writes a file `custom_flat.png` directly inside it, sets `process.env.UPLOADS_DIR` temporarily, calls `uploadGetHandler` with `'custom_flat.png'`, and asserts `200` + matching bytes (restoring `process.env.UPLOADS_DIR` in `finally`).
2. Asserts `fs.existsSync(path.join(process.cwd(), 'src/app/api/uploads/[filename]/route.ts')) === false` so the shadow route cannot return.

- [ ] **Step 2: Run test to verify the second assertion fails while `[filename]/route.ts` still exists**

Run: `npx tsx --test tests/uploads-route.test.ts`
Expected: FAIL on `existsSync(.../[filename]/route.ts) === false`.

- [ ] **Step 3: Delete `src/app/api/uploads/[filename]/route.ts`**

- [ ] **Step 4: Run full verification suite (`npm run lint`, `npm test`, `npm run build`)**

Run:
- `npx tsx --test tests/uploads-route.test.ts` -> Expected: PASS
- `npm run lint` -> Expected: Exit 0 (`0 errors`)
- `npm test` -> Expected: All suites & tests PASS (`0 fail`)
- `npm run build` -> Expected: Exit 0, `/api/uploads/[filename]` no longer in route output

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(uploads): remove duplicate [filename] upload route shadowing UPLOADS_DIR"
```
