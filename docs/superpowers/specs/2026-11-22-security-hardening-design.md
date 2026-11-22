# Design Spec: Production Security Hardening (Task A)

**Date:** 2026-11-22  
**Size:** Small change  
**Status:** Proposed (Awaiting approval)

## Intent & Why
Harden runtime security around authentication, secrets, and cookie handling before production/Docker deployment without breaking internal HTTP LAN access, existing AES-256-GCM encrypted rows in SQLite, or existing IT Admin (`STAFF`/`MANAGER`) operations.

## Goals & Non-Goals
- **Goals:**
  1. Emit clear startup/runtime `[SECURITY WARNING]` logs (to container stdout/stderr) in `NODE_ENV === 'production'` when `ENCRYPTION_SECRET` or `ADMIN_PASSCODE` uses built-in/placeholder defaults.
  2. Set `secure: true` on the `incidenthub_admin_session` cookie dynamically when requests arrive over HTTPS (`req.nextUrl.protocol === 'https:'` or `x-forwarded-proto` is `https`).
  3. Use constant-time comparison for HMAC signature verification (`src/lib/auth.ts`), master passcode login (`src/app/api/auth/admin/route.ts`), and `x-api-key` verification (`src/lib/api-guard.ts`).
  4. Remove the legacy duplicate `src/app/api/uploads/[filename]/route.ts` so `src/app/api/uploads/[...path]/route.ts` handles both legacy single-segment and nested `UPLOADS_DIR` paths consistently.
- **Non-Goals (Explicitly Excluded):**
  - Do **not** restrict `/api/integrations`, `/api/categories`, or `/api/root-causes` to `MANAGER`-only; authenticated IT Admins (`STAFF` and `MANAGER`) keep their existing access.
  - Do **not** add in-app IP rate limiting on login/tracking routes (shared office NAT IPs could cause false lockouts; handle rate limits at reverse proxy if needed).
  - Do **not** break `next build` or `npm test` when secrets are omitted in build/test environments.

## Constraints
- `src/lib/auth.ts` uses Web Crypto API (`crypto.subtle`) so it remains Edge-compatible for `src/proxy.ts`; constant-time comparison inside `auth.ts` must not depend on Node-only `crypto.timingSafeEqual` if Edge compatibility is required.
- `docker-compose.yml` provides default fallback env values when `.env` omits them, and existing deployments may have SQLite rows encrypted with the default key.

## Approaches Considered
1. **Warn-only on default secrets in Production + dynamic HTTPS cookie + constant-time checks (Chosen)**
   - *Pros:* Zero breaking changes for existing HTTP LAN deployments, Docker Compose defaults, or previously encrypted SMTP credentials; surfaces misconfiguration clearly in `docker logs it-incident-app`.
   - *Cons:* An operator who ignores container logs could still run with weak defaults.
2. **Fail-fast boot crash on default secrets**
   - *Pros:* Impossible to boot with weak defaults.
   - *Cons:* Breaks `docker-compose.yml` defaults and breaks decryption of existing DB rows encrypted with the old default key. Rejected per user choice.
3. **Restrict `/api/integrations` to `MANAGER`-only**
   - *Rejected:* User explicitly wants IT Admins (`STAFF` + `MANAGER`) to retain `/api/integrations` access.

## Architecture & Scope Summary
- `src/lib/auth.ts`: Add Edge-safe constant-time string comparison helper (`constantTimeEqual`) for `sig === expectedSig` and `verifyInviteToken`; add once-per-process `warnIfDefaultSecretsInProd()` helper checking `ENCRYPTION_SECRET` and `ADMIN_PASSCODE`.
- `src/lib/crypto.ts`: Reuse/align default secret warning check on production encryption/decryption path (logged once per process, never during `next build` / `test`).
- `src/lib/api-guard.ts`: Compare `x-api-key` against `mcpSecurity.apiKey` using `constantTimeEqual`.
- `src/app/api/auth/admin/route.ts`: Compare passcode using `constantTimeEqual`; set cookie `secure` dynamically from request protocol / `x-forwarded-proto`; trigger startup secret warning on auth check.
- `src/app/api/uploads/[filename]/route.ts`: Delete duplicate legacy route so `[...path]/route.ts` serves all `/uploads/*` requests consistently with `UPLOADS_DIR`.
- `tests/security-crypto-auth.test.ts`: Add focused unit tests for `constantTimeEqual`, protocol-aware `secure` cookie behavior, and warning helper without mutating production DB.
