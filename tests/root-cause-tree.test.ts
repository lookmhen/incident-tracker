import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import prisma from '../src/lib/prisma';
import { ADMIN_COOKIE_NAME, createAdminSessionToken } from '../src/lib/auth';
import { RootCauseService } from '../src/lib/services/root-cause.service';
import { IncidentService } from '../src/lib/services/incident.service';
import { IncidentAnalyticsService } from '../src/lib/services/incident-analytics.service';
import { IncidentServiceError } from '../src/lib/services/incident-errors';
import { IntegrationService } from '../src/lib/services/integration.service';
import { buildFilterWhere } from '../src/lib/services/incident-shared';
import {
  GET as rootCausesGet,
  POST as rootCausesPost,
  PATCH as rootCausesPatch,
  DELETE as rootCausesDelete,
} from '../src/app/api/root-causes/route';
import { PATCH as incidentPatch } from '../src/app/api/incidents/[id]/route';

describe('14. Hierarchical Root Cause Tree (Parent > Sub-branch)', () => {
  const createdIncidentIds: string[] = [];
  let backupRootCauseRow: { value: string; isEnabled: boolean } | null = null;
  let initialTeamsEnabled = true;

  before(async () => {
    const raw = await IntegrationService.getRawConfig();
    initialTeamsEnabled = raw.teams.isEnabled;
    await IntegrationService.saveTeamsConfig({ isEnabled: false });

    backupRootCauseRow = await prisma.integrationConfig.findUnique({
      where: { key: 'root_cause_options' },
      select: { value: true, isEnabled: true },
    });
    await prisma.integrationConfig.deleteMany({ where: { key: 'root_cause_options' } });
  });

  after(async () => {
    await new Promise((r) => setTimeout(r, 100));
    await IntegrationService.saveTeamsConfig({ isEnabled: initialTeamsEnabled });
    if (backupRootCauseRow) {
      await prisma.integrationConfig.upsert({
        where: { key: 'root_cause_options' },
        update: { value: backupRootCauseRow.value, isEnabled: backupRootCauseRow.isEnabled },
        create: {
          key: 'root_cause_options',
          value: backupRootCauseRow.value,
          isEnabled: backupRootCauseRow.isEnabled,
        },
      });
    } else {
      await prisma.integrationConfig.deleteMany({ where: { key: 'root_cause_options' } });
    }
    if (createdIncidentIds.length > 0) {
      await prisma.incident.deleteMany({ where: { id: { in: createdIncidentIds } } });
    }
  });

  it('returns default 2-level tree and migrates legacy flat string[] cleanly', async () => {
    const defaultTree = await RootCauseService.getRootCauseTree();
    assert.deepEqual(defaultTree, [
      { name: 'Human', children: ['User Knowledge Gap', 'Security Control'] },
      { name: 'System', children: ['Program Defect', 'SAP Configuration', 'Procedure Gap'] },
      { name: 'Data', children: ['Master Data Quality', 'Authorization'] },
    ]);

    const flatOptions = await RootCauseService.getRootCauseOptions();
    assert.ok(flatOptions.includes('Human > User Knowledge Gap'));
    assert.ok(flatOptions.includes('System > SAP Configuration'));
    assert.ok(!flatOptions.includes('Human'));

    // Simulate legacy flat string[] config with a custom string
    await prisma.integrationConfig.upsert({
      where: { key: 'root_cause_options' },
      update: { value: JSON.stringify(['Human', 'System', 'Data', 'Vendor Issue']), isEnabled: true },
      create: {
        key: 'root_cause_options',
        value: JSON.stringify(['Human', 'System', 'Data', 'Vendor Issue']),
        isEnabled: true,
      },
    });

    const migrated = await RootCauseService.getRootCauseTree();
    assert.deepEqual(migrated, [
      { name: 'Human', children: ['User Knowledge Gap', 'Security Control'] },
      { name: 'System', children: ['Program Defect', 'SAP Configuration', 'Procedure Gap'] },
      { name: 'Data', children: ['Master Data Quality', 'Authorization'] },
      { name: 'Vendor Issue', children: [] },
    ]);

    const migratedFlat = await RootCauseService.getRootCauseOptions();
    assert.ok(migratedFlat.includes('Vendor Issue'));
    assert.ok(migratedFlat.includes('Human > Security Control'));

    await prisma.integrationConfig.deleteMany({ where: { key: 'root_cause_options' } });
  });

  it('rejects ">" in parent or sub-branch names with 400 and supports full CRUD + transactional rename sync', async () => {
    const staffToken = await createAdminSessionToken({
      username: 'rc_staff',
      name: 'RC Staff',
      role: 'STAFF',
    });
    const cookie = `${ADMIN_COOKIE_NAME}=${staffToken}`;

    // Unauthenticated mutations blocked (401)
    const unauthPost = await rootCausesPost(
      new NextRequest('http://localhost/api/root-causes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'add_parent', name: 'Blocked' }),
      })
    );
    assert.equal(unauthPost.status, 401);

    // Reject '>' in parent or child names
    await assert.rejects(
      () => RootCauseService.addRootCauseParent('Bad > Parent'),
      (err: unknown) => err instanceof IncidentServiceError && err.status === 400
    );
    await assert.rejects(
      () => RootCauseService.addRootCauseChild('Human', 'Bad > Child'),
      (err: unknown) => err instanceof IncidentServiceError && err.status === 400
    );

    const tag = `${Date.now()}`;
    const parentOld = `Infra_${tag}`;
    const parentNew = `Platform_${tag}`;
    const childOld = `Network_${tag}`;
    const childNew = `Firewall_${tag}`;

    // Add parent via API
    const addParentRes = await rootCausesPost(
      new NextRequest('http://localhost/api/root-causes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ action: 'add_parent', name: parentOld }),
      })
    );
    assert.equal(addParentRes.status, 201);
    const treeAfterParent = await addParentRes.json();
    assert.ok(treeAfterParent.some((n: any) => n.name === parentOld && n.children.length === 0));

    // Add child via API
    const addChildRes = await rootCausesPost(
      new NextRequest('http://localhost/api/root-causes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ action: 'add_child', parent: parentOld, name: childOld }),
      })
    );
    assert.equal(addChildRes.status, 201);

    // GET ?format=tree returns RootCauseNode[]
    const getTreeRes = await rootCausesGet(new NextRequest('http://localhost/api/root-causes?format=tree'));
    assert.equal(getTreeRes.status, 200);
    const fetchedTree = await getTreeRes.json();
    const infraNode = fetchedTree.find((n: any) => n.name === parentOld);
    assert.deepEqual(infraNode?.children, [childOld]);

    // Seed 2 incidents: one bare legacy parent, one with sub-branch
    const incBare = await IncidentService.createIncident({
      reporterName: 'RC Tester 1',
      contactInfo: 'rc1@test.local',
      title: `Bare RCA ${tag}`,
      description: 'Legacy bare parent',
      category: 'Network',
    });
    const incBranch = await IncidentService.createIncident({
      reporterName: 'RC Tester 2',
      contactInfo: 'rc2@test.local',
      title: `Branch RCA ${tag}`,
      description: 'Sub-branch path',
      category: 'Network',
    });
    createdIncidentIds.push(incBare.id, incBranch.id);

    await prisma.incident.update({ where: { id: incBare.id }, data: { rootCause: parentOld } });
    await prisma.incident.update({
      where: { id: incBranch.id },
      data: { rootCause: `${parentOld} > ${childOld}` },
    });

    // Rename child via PATCH -> syncs Incident.rootCause
    const renameChildRes = await rootCausesPatch(
      new NextRequest('http://localhost/api/root-causes', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          action: 'rename_child',
          parent: parentOld,
          oldName: childOld,
          newName: childNew,
        }),
      })
    );
    assert.equal(renameChildRes.status, 200);
    const afterChildRename = await prisma.incident.findUnique({ where: { id: incBranch.id } });
    assert.equal(afterChildRename?.rootCause, `${parentOld} > ${childNew}`);

    // Rename parent via PATCH -> syncs both bare and prefixed Incident.rootCause rows
    const renameParentRes = await rootCausesPatch(
      new NextRequest('http://localhost/api/root-causes', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          action: 'rename_parent',
          oldName: parentOld,
          newName: parentNew,
        }),
      })
    );
    assert.equal(renameParentRes.status, 200);
    const bareAfter = await prisma.incident.findUnique({ where: { id: incBare.id } });
    const branchAfter = await prisma.incident.findUnique({ where: { id: incBranch.id } });
    assert.equal(bareAfter?.rootCause, parentNew);
    assert.equal(branchAfter?.rootCause, `${parentNew} > ${childNew}`);

    // Delete child & parent via DELETE
    const delChildRes = await rootCausesDelete(
      new NextRequest(
        `http://localhost/api/root-causes?parent=${encodeURIComponent(parentNew)}&child=${encodeURIComponent(childNew)}`,
        { method: 'DELETE', headers: { cookie } }
      )
    );
    assert.equal(delChildRes.status, 200);
    const delParentRes = await rootCausesDelete(
      new NextRequest(`http://localhost/api/root-causes?parent=${encodeURIComponent(parentNew)}`, {
        method: 'DELETE',
        headers: { cookie },
      })
    );
    assert.equal(delParentRes.status, 200);

    // Reject deleting the last remaining parent (400)
    const remaining = await RootCauseService.getRootCauseTree();
    for (let i = 0; i < remaining.length - 1; i++) {
      await RootCauseService.deleteRootCauseParent(remaining[i].name);
    }
    const lastParent = remaining[remaining.length - 1].name;
    await assert.rejects(
      () => RootCauseService.deleteRootCauseParent(lastParent),
      (err: unknown) => err instanceof IncidentServiceError && err.status === 400
    );

    await prisma.integrationConfig.deleteMany({ where: { key: 'root_cause_options' } });
  });

  it('enforces sub-branch selection on PENDING_CONFIRM, RESOLVED, and CLOSED', async () => {
    const staffToken = await createAdminSessionToken({
      username: 'close_staff',
      name: 'Close Staff',
      role: 'STAFF',
    });
    const staffCookie = `${ADMIN_COOKIE_NAME}=${staffToken}`;

    const inc = await IncidentService.createIncident({
      reporterName: 'Closure Tester',
      contactInfo: 'close@test.local',
      title: 'Sub-branch closure validation',
      description: 'Must reject bare parent on closure',
      category: 'SAP Basis',
    });
    createdIncidentIds.push(inc.id);

    await IncidentService.updateIncident(inc.ticketNo, {
      status: 'IN_PROGRESS',
      assignedTo: 'Close Staff',
    });

    // Bare parent rejected with 400 on PENDING_CONFIRM via API
    const barePendingRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({ status: 'PENDING_CONFIRM', rootCause: 'Human' }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(barePendingRes.status, 400);

    // Bare parent rejected with 400 on RESOLVED and CLOSED via service
    for (const status of ['RESOLVED', 'CLOSED'] as const) {
      await assert.rejects(
        () => IncidentService.updateIncident(inc.ticketNo, { status, rootCause: 'Human' }),
        (err: unknown) => err instanceof IncidentServiceError && err.status === 400
      );
    }

    // Valid Parent > Sub-branch with resolution succeeds
    const validRes = await incidentPatch(
      new NextRequest(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: staffCookie },
        body: JSON.stringify({
          status: 'PENDING_CONFIRM',
          rootCause: 'Human > User Knowledge Gap',
          resolution: 'Guided user through correct workflow',
        }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(validRes.status, 200);
    assert.equal((await validRes.json()).rootCause, 'Human > User Knowledge Gap');
  });

  it('matches Parent and Parent > Child in filter without OR collision and aggregates byRootCauseGrouped', async () => {
    const tag = `TreeAnalytics_${Date.now()}`;
    const mk = async (title: string, rootCause: string | null) => {
      const inc = await IncidentService.createIncident({
        reporterName: 'Analytics Tester',
        department: tag,
        contactInfo: 'ana@test.local',
        title: `${tag} ${title}`,
        description: 'Tree analytics test',
        category: 'Helpdesk',
      });
      createdIncidentIds.push(inc.id);
      if (rootCause) {
        await prisma.incident.update({ where: { id: inc.id }, data: { rootCause } });
      }
      return inc;
    };

    await mk('legacy-human', 'Human');
    await mk('branch-gap-1', 'Human > User Knowledge Gap');
    await mk('branch-gap-2', 'Human > User Knowledge Gap');
    await mk('branch-sec', 'Human > Security Control');
    await mk('sys-defect', 'System > Program Defect');
    await mk('unspecified', null);

    // Verify buildFilterWhere combines rootCause parent OR with search OR via AND
    const combinedWhere = buildFilterWhere({ rootCause: 'Human', search: 'branch-gap' });
    assert.ok(Array.isArray(combinedWhere.AND));
    assert.ok(Array.isArray(combinedWhere.OR));

    // Parent filter + search together must not collide
    const searchFiltered = await IncidentService.getIncidents({
      department: tag,
      rootCause: 'Human',
      search: 'branch-gap',
    });
    assert.equal(searchFiltered.incidents.length, 2);

    // Parent filter in analytics matches both bare "Human" and "Human > *" (4 total)
    const humanAnalytics = await IncidentAnalyticsService.getAnalyticsData({
      department: tag,
      rootCause: 'Human',
    });
    assert.equal(humanAnalytics.summary.total, 4);

    // Exact sub-branch filter matches only 2
    const gapAnalytics = await IncidentAnalyticsService.getAnalyticsData({
      department: tag,
      rootCause: 'Human > User Knowledge Gap',
    });
    assert.equal(gapAnalytics.summary.total, 2);

    // Unspecified filter matches 1
    const unspecAnalytics = await IncidentAnalyticsService.getAnalyticsData({
      department: tag,
      rootCause: 'Unspecified',
    });
    assert.equal(unspecAnalytics.summary.total, 1);

    // Full grouped breakdown & merged rootCauseTree
    const fullAnalytics = await IncidentAnalyticsService.getAnalyticsData({ department: tag });
    assert.equal(fullAnalytics.summary.total, 6);

    const humanGroup = fullAnalytics.byRootCauseGrouped.find((g) => g.parent === 'Human');
    assert.ok(humanGroup);
    assert.equal(humanGroup.count, 4);
    assert.equal(humanGroup.percentage, 67);
    assert.deepEqual(humanGroup.children, [
      {
        name: 'User Knowledge Gap',
        fullPath: 'Human > User Knowledge Gap',
        count: 2,
        percentage: 33,
      },
      {
        name: 'Security Control',
        fullPath: 'Human > Security Control',
        count: 1,
        percentage: 17,
      },
    ]);

    const sysGroup = fullAnalytics.byRootCauseGrouped.find((g) => g.parent === 'System');
    assert.equal(sysGroup?.count, 1);
    assert.equal(sysGroup?.children[0]?.name, 'Program Defect');

    const unspecGroup = fullAnalytics.byRootCauseGrouped.find((g) => g.parent === 'Unspecified');
    assert.equal(unspecGroup?.count, 1);
    assert.deepEqual(unspecGroup?.children, []);

    assert.ok(
      fullAnalytics.filterOptions.rootCauseTree.some(
        (n) => n.name === 'Human' && n.children.includes('User Knowledge Gap')
      )
    );
  });
});
