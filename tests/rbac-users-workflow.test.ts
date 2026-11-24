import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import prisma from '../src/lib/prisma';
import { ADMIN_COOKIE_NAME, createAdminSessionToken, createInviteToken } from '../src/lib/auth';
import { UserService } from '../src/lib/services/user.service';
import { IncidentService } from '../src/lib/services/incident.service';
import { IntegrationService } from '../src/lib/services/integration.service';
import { McpService } from '../src/lib/services/mcp.service';
import { KmExportService } from '../src/lib/services/km-export.service';
import { GET as authGet, POST as authPost } from '../src/app/api/auth/admin/route';
import { GET as usersGet, POST as usersPost } from '../src/app/api/users/route';
import { PATCH as userPatch, DELETE as userDelete } from '../src/app/api/users/[id]/route';
import {
  GET as inviteGet,
  POST as invitePost,
  PUT as invitePut,
} from '../src/app/api/users/invite/route';
import { PATCH as incidentPatch } from '../src/app/api/incidents/[id]/route';
import { POST as attachmentsPost } from '../src/app/api/incidents/[id]/attachments/route';
import { GET as exportGet } from '../src/app/api/incidents/export/route';
import { GET as trackGet } from '../src/app/api/track/[id]/route';

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
    const acceptCookie = acceptRes.headers.get('set-cookie') || '';
    assert.ok(acceptCookie.includes(ADMIN_COOKIE_NAME));
    assert.ok(!/;\s*secure\b/i.test(acceptCookie), `Expected no Secure flag on HTTP, got: ${acceptCookie}`);

    // Invite acceptance behind HTTPS proxy sets Secure cookie flag
    const httpsInviteToken = await createInviteToken({
      email: `https_inv_${suffix}@test.local`,
      name: 'HTTPS Invited',
      role: 'STAFF',
    });
    const httpsAcceptRes = await invitePut(
      new NextRequest('http://localhost/api/users/invite', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-proto': 'https',
        },
        body: JSON.stringify({
          token: httpsInviteToken,
          password: 'secret123',
        }),
      })
    );
    assert.equal(httpsAcceptRes.status, 201);
    createdUserIds.push((await httpsAcceptRes.json()).user.id);
    const httpsAcceptCookie = httpsAcceptRes.headers.get('set-cookie') || '';
    assert.ok(httpsAcceptCookie.includes(ADMIN_COOKIE_NAME));
    assert.match(httpsAcceptCookie, /;\s*secure\b/i);

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
        body: JSON.stringify({ title: 'Refined Problem Title', rootCause: 'System > Program Defect' }),
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

    // 2b. STAFF cannot submit PENDING_CONFIRM before claiming the ticket (400)
    const unclaimedPendingRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({
          status: 'PENDING_CONFIRM',
          resolution: 'Forgot to claim first',
        }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(unclaimedPendingRes.status, 400);
    const unclaimedErr = await unclaimedPendingRes.json();
    assert.match(unclaimedErr.error || '', /must be claimed/i);

    // 2c. MANAGER is strict one-way: cannot edit details, claim, hold, or close directly from OPEN (403)
    for (const forbiddenBody of [
      { title: 'Manager hijack' },
      { category: 'Network' },
      { assignedTo: managerUser.name, status: 'IN_PROGRESS' },
      { status: 'RESOLVED' },
    ]) {
      const mgrBlockedRes = await incidentPatch(
        new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', cookie: mgrCookie },
          body: JSON.stringify(forbiddenBody),
        }),
        { params: Promise.resolve({ id: inc.ticketNo }) }
      );
      assert.equal(mgrBlockedRes.status, 403);
    }

    // 3. STAFF claims ticket, then submits PENDING_CONFIRM
    const claimRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({
          assignedTo: staffUser.name,
          status: 'IN_PROGRESS',
        }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(claimRes.status, 200);

    const pendingRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({
          status: 'PENDING_CONFIRM',
          resolution: 'Restarted worker process temporarily',
          resolutionType: 'WORKAROUND',
          workaroundNote: 'Monitor memory daily until patch applied',
          managerComment: 'staff should not write this',
        }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(pendingRes.status, 200);
    const pending = await pendingRes.json();
    assert.equal(pending.status, 'PENDING_CONFIRM');
    assert.equal(pending.closedAt, null);
    assert.equal(pending.managerComment ?? null, null);

    // 3b. Analytics byStatus includes PENDING_CONFIRM so status sum matches total
    const analyticsMid = await IncidentService.getAnalyticsData({});
    const statusSum = analyticsMid.byStatus.reduce((s, b) => s + b.count, 0);
    assert.equal(statusSum, analyticsMid.summary.total);

    // 3c. Even in PENDING_CONFIRM, MANAGER cannot modify Staff fields (403); can only Reject or Approve
    const mgrMutateOnConfirmRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: mgrCookie },
        body: JSON.stringify({ status: 'RESOLVED', resolutionType: 'PERMANENT' }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(mgrMutateOnConfirmRes.status, 403);

    // MANAGER rejects PENDING_CONFIRM -> IN_PROGRESS with comment, then STAFF re-submits
    const rejectRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: mgrCookie },
        body: JSON.stringify({ status: 'IN_PROGRESS', managerComment: 'Please attach vendor ticket' }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(rejectRes.status, 200);
    const rejected = await rejectRes.json();
    assert.equal(rejected.status, 'IN_PROGRESS');
    assert.equal(rejected.managerComment, 'Please attach vendor ticket');

    const resubmitRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'PENDING_CONFIRM' }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(resubmitRes.status, 200);

    // 4. MANAGER confirms RESOLVED (Approve only) -> stops MTTR and records resolvedBy
    const confirmRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: mgrCookie },
        body: JSON.stringify({
          status: 'RESOLVED',
          managerComment: '  Good fix, follow up with vendor  ',
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
    assert.equal(confirmed.managerComment, 'Good fix, follow up with vendor');

    // Internal managerComment must never leak into MCP or KM outputs
    const freshInc = await IncidentService.getIncidentById(inc.ticketNo);
    assert.ok(freshInc);
    assert.ok(!JSON.stringify(McpService.formatMcpContext(freshInc)).includes('Good fix'));
    assert.ok(!KmExportService.toKnowledgeDocument(freshInc).includes('Good fix'));

    // Public tracking API: verifies sanitized fields and zero leakage of internal data or reporter contact
    const trackRes = await trackGet(
      new NextRequest(`http://localhost/api/track/${inc.ticketNo}`),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(trackRes.status, 200);
    const trackData = await trackRes.json();
    assert.equal(trackData.ticketNo, inc.ticketNo);
    assert.equal(trackData.status, 'RESOLVED');
    assert.equal(trackData.resolutionType, 'WORKAROUND');
    assert.equal(trackData.managerComment, undefined);
    assert.equal(trackData.contactInfo, undefined);
    assert.equal(trackData.reporterName, undefined);
    assert.equal(trackData.assignedTo, undefined);
    assert.ok(!JSON.stringify(trackData).includes('Good fix'));
    assert.ok(!JSON.stringify(trackData).includes('qa@example.com'));

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

    // 5. After RESOLVED, editing title or description is locked (400 for service / 403 for MANAGER one-way)
    const lockedEditRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: mgrCookie },
        body: JSON.stringify({ description: 'Tampered after closure' }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(lockedEditRes.status, 403);
  });

  it('supports On Hold/Resume, status-preserving re-assign, and Manager-only Reopen', async () => {
    const suffix = Date.now();
    const localUserIds: string[] = [];
    let localIncidentId: string | null = null;

    try {
      const staffUser = await UserService.createUser({
        username: `wf_op_${suffix}`,
        name: 'Workflow Staff',
        role: 'STAFF',
        password: 'password1',
      });
      localUserIds.push(staffUser.id);
      const managerUser = await UserService.createUser({
        username: `wf_mgr_${suffix}`,
        name: 'Workflow Manager',
        role: 'MANAGER',
        password: 'password1',
      });
      localUserIds.push(managerUser.id);

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
        reporterName: 'Transition Tester',
        contactInfo: 'trans@test.local',
        title: 'Transition Workflow Ticket',
        description: 'Verify workflow status transitions',
        category: 'SAP Basis',
      });
      localIncidentId = inc.id;

      const patch = (cookie: string, body: Record<string, unknown>) =>
        incidentPatch(
          new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json', cookie },
            body: JSON.stringify(body),
          }),
          { params: Promise.resolve({ id: inc.ticketNo }) }
        );

      // Claim ticket -> IN_PROGRESS
      const claimRes = await patch(staffCookie, {
        assignedTo: staffUser.name,
        status: 'IN_PROGRESS',
        rootCause: 'System > Program Defect',
      });
      assert.equal(claimRes.status, 200);
      assert.equal((await claimRes.json()).status, 'IN_PROGRESS');

      // 1. On Hold sets ON_HOLD + auto-excludes MTTR
      const holdRes = await patch(staffCookie, { status: 'ON_HOLD' });
      assert.equal(holdRes.status, 200);
      const held = await holdRes.json();
      assert.equal(held.status, 'ON_HOLD');
      assert.equal(held.mttrExcluded, true);

      // 2. Re-assign without status preserves ON_HOLD (does not reset to IN_PROGRESS)
      const reassignHoldRes = await patch(staffCookie, { assignedTo: 'Another Staff' });
      assert.equal(reassignHoldRes.status, 200);
      const reassignedHold = await reassignHoldRes.json();
      assert.equal(reassignedHold.assignedTo, 'Another Staff');
      assert.equal(reassignedHold.status, 'ON_HOLD');

      // Resume -> IN_PROGRESS
      const resumeRes = await patch(staffCookie, { status: 'IN_PROGRESS' });
      assert.equal(resumeRes.status, 200);
      assert.equal((await resumeRes.json()).status, 'IN_PROGRESS');

      // Re-assign without status also preserves PENDING_CONFIRM
      const pendingRes = await patch(staffCookie, {
        status: 'PENDING_CONFIRM',
        resolution: 'Applied fix',
      });
      assert.equal(pendingRes.status, 200);
      const reassignPendingRes = await patch(staffCookie, { assignedTo: staffUser.name });
      assert.equal(reassignPendingRes.status, 200);
      const reassignedPending = await reassignPendingRes.json();
      assert.equal(reassignedPending.assignedTo, staffUser.name);
      assert.equal(reassignedPending.status, 'PENDING_CONFIRM');

      // 2b. Edit reporterName, department, and contactInfo (rejects blank reporterName with 400)
      const blankReporterRes = await patch(staffCookie, { reporterName: '   ' });
      assert.equal(blankReporterRes.status, 400);

      const editReporterRes = await patch(staffCookie, {
        reporterName: 'Somchai Corrected',
        department: 'Finance & Accounting',
        contactInfo: 'ext-9999',
      });
      assert.equal(editReporterRes.status, 200);
      const editedReporter = await editReporterRes.json();
      assert.equal(editedReporter.reporterName, 'Somchai Corrected');
      assert.equal(editedReporter.department, 'Finance & Accounting');
      assert.equal(editedReporter.contactInfo, 'ext-9999');

      // 3. Manager resolves -> Staff & Manager can still fix reporterName/department/contactInfo without altering closedAt,
      //    while One-way lock blocks Staff on all other fields (403) and blocks Manager content/attachment edits (400)
      const resolveRes = await patch(mgrCookie, { status: 'RESOLVED' });
      assert.equal(resolveRes.status, 200);
      const resolved = await resolveRes.json();
      assert.equal(resolved.status, 'RESOLVED');
      assert.notEqual(resolved.closedAt, null);

      // Staff CAN fix reporterName/department/contactInfo on closed ticket (200), preserving closedAt
      const staffEditClosedDeptRes = await patch(staffCookie, {
        reporterName: 'Somchai Final',
        department: 'Packing',
        contactInfo: 'ext-8888',
      });
      assert.equal(staffEditClosedDeptRes.status, 200);
      const staffEditedClosed = await staffEditClosedDeptRes.json();
      assert.equal(staffEditedClosed.reporterName, 'Somchai Final');
      assert.equal(staffEditedClosed.department, 'Packing');
      assert.equal(staffEditedClosed.contactInfo, 'ext-8888');
      assert.equal(staffEditedClosed.closedAt, resolved.closedAt);

      // Staff CANNOT piggyback status/category/closedAt alongside department on a closed ticket (403)
      const staffPiggybackRes = await patch(staffCookie, { department: 'IT Ops', status: 'IN_PROGRESS' });
      assert.equal(staffPiggybackRes.status, 403);
      const staffClosedCatRes = await patch(staffCookie, { category: 'Network' });
      assert.equal(staffClosedCatRes.status, 403);

      // Manager is read-only one-way reviewer: blocked (403) on editing department/category/assignedTo/closedAt/mttrExcluded or uploading attachments
      for (const forbidden of [
        { department: 'Finance' },
        { category: 'Network' },
        { assignedTo: managerUser.name },
        { closedAt: new Date(new Date(resolved.createdAt).getTime() + 15 * 60 * 1000).toISOString() },
        { mttrExcluded: false },
      ]) {
        const res = await patch(mgrCookie, forbidden);
        assert.equal(res.status, 403);
      }

      // Manager cannot upload attachments (403)
      const fd = new FormData();
      fd.append('file', new File([Buffer.from('PNGDATA')], 'locked.png', { type: 'image/png' }));
      fd.append('kind', 'RESOLUTION');
      const mgrAttClosedRes = await attachmentsPost(
        new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}/attachments`, {
          method: 'POST',
          headers: { cookie: mgrCookie },
          body: fd,
        }),
        { params: Promise.resolve({ id: inc.ticketNo }) }
      );
      assert.equal(mgrAttClosedRes.status, 403);

      const staffReopenRes = await patch(staffCookie, { status: 'IN_PROGRESS' });
      assert.equal(staffReopenRes.status, 403);

      // Manager Reopen clears closedAt and unlocks content edits for Staff (Manager remains read-only)
      const mgrReopenRes = await patch(mgrCookie, { status: 'IN_PROGRESS' });
      assert.equal(mgrReopenRes.status, 200);
      const reopened = await mgrReopenRes.json();
      assert.equal(reopened.status, 'IN_PROGRESS');
      assert.equal(reopened.closedAt, null);

      const mgrEditAfterReopenRes = await patch(mgrCookie, { category: 'Network' });
      assert.equal(mgrEditAfterReopenRes.status, 403);

      const staffEditAfterReopenRes = await patch(staffCookie, { category: 'Network' });
      assert.equal(staffEditAfterReopenRes.status, 200);
      assert.equal((await staffEditAfterReopenRes.json()).category, 'Network');
    } finally {
      if (localIncidentId) {
        await IncidentService.setMttrExcluded(localIncidentId, false);
        await prisma.incident.deleteMany({ where: { id: localIncidentId } });
      }
      if (localUserIds.length > 0) {
        await prisma.adminUser.deleteMany({ where: { id: { in: localUserIds } } });
      }
    }
  });
});
