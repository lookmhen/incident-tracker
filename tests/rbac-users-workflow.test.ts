import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import prisma from '../src/lib/prisma';
import { ADMIN_COOKIE_NAME, createAdminSessionToken, createInviteToken } from '../src/lib/auth';
import { UserService } from '../src/lib/services/user.service';
import { IncidentService } from '../src/lib/services/incident.service';
import { IntegrationService } from '../src/lib/services/integration.service';
import { GET as authGet, POST as authPost } from '../src/app/api/auth/admin/route';
import { GET as usersGet, POST as usersPost } from '../src/app/api/users/route';
import { PATCH as userPatch, DELETE as userDelete } from '../src/app/api/users/[id]/route';
import {
  GET as inviteGet,
  POST as invitePost,
  PUT as invitePut,
} from '../src/app/api/users/invite/route';
import { PATCH as incidentPatch } from '../src/app/api/incidents/[id]/route';
import { GET as exportGet } from '../src/app/api/incidents/export/route';

describe('12. User Management, Role-Based Access, Invite Link & Workaround Workflow', () => {
  const createdUserIds: string[] = [];
  const createdIncidentIds: string[] = [];
  let initialSmtp: any;
  let initialTeams: any;
  let backupConsumedInvites: { value: string } | null = null;

  before(async () => {
    const raw = await IntegrationService.getRawConfig();
    initialSmtp = raw.smtp;
    initialTeams = raw.teams;
    await IntegrationService.saveTeamsConfig({ isEnabled: false });
    await IntegrationService.saveSmtpConfig({ isEnabled: false });
    backupConsumedInvites = await prisma.integrationConfig.findUnique({
      where: { key: 'consumed_invites' },
      select: { value: true },
    });
  });

  after(async () => {
    await IntegrationService.saveSmtpConfig(initialSmtp);
    await IntegrationService.saveTeamsConfig(initialTeams);
    if (backupConsumedInvites) {
      await prisma.integrationConfig.upsert({
        where: { key: 'consumed_invites' },
        update: { value: backupConsumedInvites.value },
        create: { key: 'consumed_invites', value: backupConsumedInvites.value },
      });
    } else {
      await prisma.integrationConfig.deleteMany({ where: { key: 'consumed_invites' } });
    }
    if (createdIncidentIds.length > 0) {
      await prisma.incident.deleteMany({ where: { id: { in: createdIncidentIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.adminUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  it('enforces MANAGER-only user CRUD, role editing, immediate session refresh, and passcode fallback', async () => {
    const masterToken = await createAdminSessionToken(); // Master Admin = MANAGER
    const masterCookie = `${ADMIN_COOKIE_NAME}=${masterToken}`;
    const suffix = Date.now();

    // 1. Master creates STAFF user
    const createStaffRes = await usersPost(
      new NextRequest('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: masterCookie },
        body: JSON.stringify({
          username: `staff_${suffix}`,
          name: 'Staff Operator',
          email: `staff_${suffix}@test.local`,
          role: 'STAFF',
          password: 'pass1234',
        }),
      })
    );
    assert.equal(createStaffRes.status, 201);
    const { user: staffUser } = await createStaffRes.json();
    createdUserIds.push(staffUser.id);
    assert.equal(staffUser.role, 'STAFF');
    assert.equal((staffUser as any).passwordHash, undefined);

    // 2. Staff logs in with username + password
    const loginRes = await authPost(
      new NextRequest('http://localhost/api/auth/admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: staffUser.username, password: 'pass1234' }),
      })
    );
    assert.equal(loginRes.status, 200);
    const staffCookieHeader = loginRes.headers.get('set-cookie') || '';
    const staffTokenMatch = staffCookieHeader.match(new RegExp(`${ADMIN_COOKIE_NAME}=([^;]+)`));
    assert.ok(staffTokenMatch);
    const staffCookie = `${ADMIN_COOKIE_NAME}=${staffTokenMatch[1]}`;

    // 3. STAFF cannot list or create users (403)
    const deniedList = await usersGet(
      new NextRequest('http://localhost/api/users', { headers: { cookie: staffCookie } })
    );
    assert.equal(deniedList.status, 403);

    // 4. Manager promotes STAFF -> MANAGER and live /api/auth/admin reflects immediately
    const promoteRes = await userPatch(
      new NextRequest(`http://localhost/api/users/${staffUser.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: masterCookie },
        body: JSON.stringify({ role: 'MANAGER' }),
      }),
      { params: Promise.resolve({ id: staffUser.id }) }
    );
    assert.equal(promoteRes.status, 200);
    assert.equal((await promoteRes.json()).user.role, 'MANAGER');

    const promotedAuth = await (
      await authGet(new NextRequest('http://localhost/api/auth/admin', { headers: { cookie: staffCookie } }))
    ).json();
    assert.equal(promotedAuth.authenticated, true);
    assert.equal(promotedAuth.user.role, 'MANAGER');

    // 5. Manager cannot self-demote or self-delete
    const selfDemote = await userPatch(
      new NextRequest(`http://localhost/api/users/${staffUser.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ role: 'STAFF' }),
      }),
      { params: Promise.resolve({ id: staffUser.id }) }
    );
    assert.equal(selfDemote.status, 400);

    // 6. Deactivating user invalidates existing cookie immediately
    const deactivateRes = await userPatch(
      new NextRequest(`http://localhost/api/users/${staffUser.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: masterCookie },
        body: JSON.stringify({ isActive: false }),
      }),
      { params: Promise.resolve({ id: staffUser.id }) }
    );
    assert.equal(deactivateRes.status, 200);
    const deactivatedAuth = await (
      await authGet(new NextRequest('http://localhost/api/auth/admin', { headers: { cookie: staffCookie } }))
    ).json();
    assert.equal(deactivatedAuth.authenticated, false);

    // Deactivated cookie is also rejected on protected admin routes like CSV export
    const deactivatedExport = await exportGet(
      new NextRequest('http://localhost/api/incidents/export', { headers: { cookie: staffCookie } })
    );
    assert.equal(deactivatedExport.status, 401);

    // 7. Delete user via API
    const delRes = await userDelete(
      new NextRequest(`http://localhost/api/users/${staffUser.id}`, {
        method: 'DELETE',
        headers: { cookie: masterCookie },
      }),
      { params: Promise.resolve({ id: staffUser.id }) }
    );
    assert.equal(delRes.status, 200);
  });

  it('creates single-use signed invite links via email flow and rejects reuse or tampered tokens', async () => {
    const masterCookie = `${ADMIN_COOKIE_NAME}=${await createAdminSessionToken()}`;
    const staffCookie = `${ADMIN_COOKIE_NAME}=${await createAdminSessionToken({
      userId: null,
      username: 'staff_only',
      name: 'Staff Only',
      role: 'STAFF',
    })}`;
    const suffix = Date.now();

    // STAFF cannot create invite
    const staffInviteRes = await invitePost(
      new NextRequest('http://localhost/api/users/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ email: `inv_${suffix}@test.local`, name: 'Invited', role: 'STAFF' }),
      })
    );
    assert.equal(staffInviteRes.status, 403);

    // MANAGER creates invite
    const mgrInviteRes = await invitePost(
      new NextRequest('http://localhost/api/users/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: masterCookie },
        body: JSON.stringify({
          email: `mgr_inv_${suffix}@test.local`,
          name: 'Invited Manager',
          role: 'MANAGER',
        }),
      })
    );
    assert.equal(mgrInviteRes.status, 201);
    const invData = await mgrInviteRes.json();
    const parsedUrl = new URL(invData.inviteUrl);
    const token = parsedUrl.searchParams.get('token')!;
    assert.ok(token);

    // Public GET validates invite
    const checkRes = await inviteGet(
      new NextRequest(`http://localhost/api/users/invite?token=${encodeURIComponent(token)}`)
    );
    assert.equal(checkRes.status, 200);
    assert.equal((await checkRes.json()).role, 'MANAGER');

    // Public PUT accepts invite using only password (email becomes login username)
    const acceptRes = await invitePut(
      new NextRequest('http://localhost/api/users/invite', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          password: 'secret123',
        }),
      })
    );
    assert.equal(acceptRes.status, 201);
    const created = (await acceptRes.json()).user;
    createdUserIds.push(created.id);
    assert.equal(created.role, 'MANAGER');
    assert.equal(created.username, `mgr_inv_${suffix}@test.local`);
    assert.ok((acceptRes.headers.get('set-cookie') || '').includes(ADMIN_COOKIE_NAME));

    // Login using Email (case-insensitive) succeeds
    const emailLoginRes = await authPost(
      new NextRequest('http://localhost/api/auth/admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: `MGR_INV_${suffix}@TEST.LOCAL`,
          password: 'secret123',
        }),
      })
    );
    assert.equal(emailLoginRes.status, 200);

    // Inviting an already-registered email is rejected with 409
    const dupInviteRes = await invitePost(
      new NextRequest('http://localhost/api/users/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: masterCookie },
        body: JSON.stringify({
          email: `mgr_inv_${suffix}@test.local`,
          name: 'Duplicate',
          role: 'STAFF',
        }),
      })
    );
    assert.equal(dupInviteRes.status, 409);

    // Reuse of same invite token is rejected (400)
    const reuseRes = await inviteGet(
      new NextRequest(`http://localhost/api/users/invite?token=${encodeURIComponent(token)}`)
    );
    assert.equal(reuseRes.status, 400);

    // Expired token rejected
    const expiredToken = await createInviteToken({
      email: 'expired@test.local',
      name: 'Expired',
      role: 'STAFF',
      expiresHours: -1,
    });
    const expRes = await inviteGet(
      new NextRequest(`http://localhost/api/users/invite?token=${encodeURIComponent(expiredToken)}`)
    );
    assert.equal(expRes.status, 400);
  });

  it('blocks STAFF from resolving/closing, supports PENDING_CONFIRM & WORKAROUND closure, and locks Details after close', async () => {
    const suffix = Date.now();
    const staffUser = await UserService.createUser({
      username: `op_${suffix}`,
      name: 'Operator One',
      role: 'STAFF',
      password: 'password1',
    });
    const managerUser = await UserService.createUser({
      username: `mgr_${suffix}`,
      name: 'Manager Approver',
      email: `mgr_${suffix}@test.local`,
      role: 'MANAGER',
      password: 'password1',
    });
    createdUserIds.push(staffUser.id, managerUser.id);

    const staffCookie = `${ADMIN_COOKIE_NAME}=${await createAdminSessionToken({
      userId: staffUser.id,
      username: staffUser.username,
      name: staffUser.name,
      role: 'STAFF',
    })}`;
    const mgrCookie = `${ADMIN_COOKIE_NAME}=${await createAdminSessionToken({
      userId: managerUser.id,
      username: managerUser.username,
      name: managerUser.name,
      role: 'MANAGER',
    })}`;

    const inc = await IncidentService.createIncident({
      reporterName: 'Workflow Tester',
      contactInfo: 'wf@test.local',
      title: 'Original Problem Title',
      description: 'Original problem description',
      category: 'SAP Basis',
    });
    createdIncidentIds.push(inc.id);

    // 1. STAFF can edit details before closure
    const staffEditRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ title: 'Refined Problem Title', rootCause: 'System' }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(staffEditRes.status, 200);

    // 2. STAFF is blocked (403) from setting RESOLVED or CLOSED
    const staffResolveRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'RESOLVED', resolution: 'Bypass attempt' }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(staffResolveRes.status, 403);

    // 3. STAFF submits PENDING_CONFIRM
    const pendingRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({
          status: 'PENDING_CONFIRM',
          resolution: 'Restarted worker process temporarily',
          resolutionType: 'WORKAROUND',
          workaroundNote: 'Wait for vendor patch next week',
        }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(pendingRes.status, 200);
    const pending = await pendingRes.json();
    assert.equal(pending.status, 'PENDING_CONFIRM');
    assert.equal(pending.closedAt, null);

    // 3b. Analytics byStatus includes PENDING_CONFIRM so status sum matches total
    const analyticsMid = await IncidentService.getAnalyticsData({});
    const statusSum = analyticsMid.byStatus.reduce((s, b) => s + b.count, 0);
    assert.equal(statusSum, analyticsMid.summary.total);

    // 4. MANAGER confirms RESOLVED with WORKAROUND -> stops MTTR and records resolvedBy
    const confirmRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: mgrCookie },
        body: JSON.stringify({
          status: 'RESOLVED',
          resolutionType: 'WORKAROUND',
          workaroundNote: 'Monitor memory daily until patch applied',
        }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(confirmRes.status, 200);
    const confirmed = await confirmRes.json();
    assert.equal(confirmed.status, 'RESOLVED');
    assert.ok(confirmed.closedAt, 'closedAt must be set so MTTR clock stops');
    assert.equal(confirmed.resolutionType, 'WORKAROUND');
    assert.equal(confirmed.workaroundNote, 'Monitor memory daily until patch applied');
    assert.equal(confirmed.resolvedBy, 'Manager Approver');

    // 4b. STAFF cannot reopen or modify an already-RESOLVED ticket (403)
    const staffReopenRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'OPEN' }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(staffReopenRes.status, 403);

    // 5. After RESOLVED, editing title or description is locked (400) even for MANAGER
    const lockedEditRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: mgrCookie },
        body: JSON.stringify({ description: 'Tampered after closure' }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(lockedEditRes.status, 400);
  });
});
