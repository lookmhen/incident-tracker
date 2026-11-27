import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import prisma from '../src/lib/prisma';
import { ADMIN_COOKIE_NAME, createAdminSessionToken } from '../src/lib/auth';
import { IncidentService } from '../src/lib/services/incident.service';
import { IncidentServiceError } from '../src/lib/services/incident-errors';
import { IntegrationService } from '../src/lib/services/integration.service';
import { GET as incidentsGet } from '../src/app/api/incidents/route';
import { PATCH as incidentPatch } from '../src/app/api/incidents/[id]/route';
import { GET as analyticsGet } from '../src/app/api/incidents/analytics/route';
import { GET as exportGet } from '../src/app/api/incidents/export/route';
import { importIncidentsFromCsv } from '../scripts/import-csv';

async function makeAuthReq(url: string, opts: { method?: string; body?: unknown; role?: 'STAFF' | 'MANAGER'; name?: string } = {}) {
  const token = await createAdminSessionToken({
    username: opts.role === 'MANAGER' ? 'qa_mgr' : 'qa_staff',
    name: opts.name || (opts.role === 'MANAGER' ? 'QA Manager' : 'QA Staff'),
    role: opts.role || 'STAFF',
  });
  return new NextRequest(url, {
    method: opts.method || 'GET',
    headers: {
      cookie: `${ADMIN_COOKIE_NAME}=${token}`,
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

describe('13. External User Resolution Mark Workflow', () => {
  const createdIncidentIds: string[] = [];
  let initialSmtp: any;
  let initialTeams: any;

  before(async () => {
    const raw = await IntegrationService.getRawConfig();
    initialSmtp = raw.smtp;
    initialTeams = raw.teams;
    await IntegrationService.saveTeamsConfig({ isEnabled: false });
    await IntegrationService.saveSmtpConfig({ isEnabled: false });
  });

  after(async () => {
    await new Promise((r) => setTimeout(r, 100));
    await IntegrationService.saveSmtpConfig(initialSmtp);
    await IntegrationService.saveTeamsConfig(initialTeams);
    for (const id of createdIncidentIds) {
      await IncidentService.setMttrExcluded(id, false);
    }
    if (createdIncidentIds.length > 0) {
      await prisma.incident.deleteMany({ where: { id: { in: createdIncidentIds } } });
    }
  });

  it('rejects unclaimed OPEN -> PENDING_CONFIRM when resolvedByExternal is false', async () => {
    const inc = await IncidentService.createIncident({
      reporterName: 'Prd Operator',
      department: 'Production',
      contactInfo: 'ext 101',
      title: 'Holiday printer jam',
      description: 'Printer offline on Sunday',
      urgency: 'MEDIUM',
      category: 'Hardware',
    });
    createdIncidentIds.push(inc.id);

    await assert.rejects(
      () =>
        IncidentService.updateIncident(inc.id, {
          status: 'PENDING_CONFIRM',
          rootCause: 'Human > User Knowledge Gap',
          resolvedByExternal: false,
        }),
      (err: any) => err instanceof IncidentServiceError && err.status === 400
    );
  });

  it('allows unclaimed OPEN -> PENDING_CONFIRM and RESOLVED when resolvedByExternal is true, and auto-excludes MTTR', async () => {
    const inc = await IncidentService.createIncident({
      reporterName: 'Prd Operator',
      department: 'Production',
      contactInfo: 'ext 102',
      title: 'Holiday barcode scanner reset',
      description: 'Supervisor Prd rebooted terminal and fixed',
      urgency: 'LOW',
      category: 'Hardware',
    });
    createdIncidentIds.push(inc.id);

    // Staff submits PENDING_CONFIRM without claiming
    const pendingRes = await incidentPatch(
      await makeAuthReq(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        role: 'STAFF',
        body: {
          status: 'PENDING_CONFIRM',
          rootCause: 'System > Program Defect',
          resolution: 'Supervisor Prd restarted scanner cradle.',
          resolutionType: 'WORKAROUND',
          workaroundNote: 'Check cable during PM',
          resolvedByExternal: true,
        },
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(pendingRes.status, 200);
    const pendingJson = await pendingRes.json();
    assert.equal(pendingJson.status, 'PENDING_CONFIRM');
    assert.equal(pendingJson.assignedTo, null);
    assert.equal(pendingJson.resolvedByExternal, true);
    assert.equal(pendingJson.mttrExcluded, true);
    assert.equal(pendingJson.resolutionType, 'WORKAROUND');

    // Manager confirms RESOLVED without claiming and without re-sending Staff fields
    const resolvedRes = await incidentPatch(
      await makeAuthReq(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        role: 'MANAGER',
        body: {
          status: 'RESOLVED',
          managerComment: 'Verified holiday external resolution',
        },
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(resolvedRes.status, 200);
    const resolvedJson = await resolvedRes.json();
    assert.equal(resolvedJson.status, 'RESOLVED');
    assert.equal(resolvedJson.resolvedByExternal, true);
    assert.equal(resolvedJson.mttrExcluded, true);
    assert.equal(resolvedJson.resolvedBy, 'QA Staff');

    // Closed lock blocks mutating resolvedByExternal (403 for Manager one-way, 400 at service level)
    const lockedRes = await incidentPatch(
      await makeAuthReq(`http://localhost/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        role: 'MANAGER',
        body: { resolvedByExternal: false },
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(lockedRes.status, 403);
    await assert.rejects(
      () => IncidentService.updateIncident(inc.ticketNo, { resolvedByExternal: false }),
      (err: any) => err instanceof IncidentServiceError && err.status === 400
    );
  });

  it('restores mttrExcluded to false when resolvedByExternal is unchecked before close (non-ON_HOLD)', async () => {
    const inc = await IncidentService.createIncident({
      reporterName: 'Prd Lead',
      department: 'Production',
      contactInfo: 'ext 103',
      title: 'Mis-marked external case',
      description: 'Toggled external then unchecked',
      urgency: 'LOW',
      category: 'Network',
    });
    createdIncidentIds.push(inc.id);

    const marked = await IncidentService.updateIncident(inc.id, { resolvedByExternal: true });
    assert.equal(marked.resolvedByExternal, true);
    assert.equal(marked.mttrExcluded, true);

    const unmarked = await IncidentService.updateIncident(inc.id, { resolvedByExternal: false });
    assert.equal(unmarked.resolvedByExternal, false);
    assert.equal(unmarked.mttrExcluded, false);
  });

  it('filters incidents by resolvedByExternal=true and resolvedByExternal=false via GET /api/incidents', async () => {
    const extInc = await IncidentService.createIncident({
      reporterName: 'Prd Sup',
      department: 'Production',
      contactInfo: 'ext 104',
      title: 'Filter test external unique-tag-xyz',
      description: 'Fixed by external',
      urgency: 'LOW',
      category: 'Hardware',
    });
    const itInc = await IncidentService.createIncident({
      reporterName: 'Finance User',
      department: 'Finance',
      contactInfo: 'ext 105',
      title: 'Filter test internal unique-tag-xyz',
      description: 'Fixed by IT',
      urgency: 'LOW',
      category: 'Hardware',
    });
    createdIncidentIds.push(extInc.id, itInc.id);

    await IncidentService.updateIncident(extInc.id, { resolvedByExternal: true });

    const extOnlyRes = await incidentsGet(
      await makeAuthReq('http://localhost/api/incidents?search=unique-tag-xyz&resolvedByExternal=true')
    );
    assert.equal(extOnlyRes.status, 200);
    const extOnlyJson = await extOnlyRes.json();
    assert.deepEqual(
      extOnlyJson.incidents.map((r: any) => r.id),
      [extInc.id]
    );

    const itOnlyRes = await incidentsGet(
      await makeAuthReq('http://localhost/api/incidents?search=unique-tag-xyz&resolvedByExternal=false')
    );
    assert.equal(itOnlyRes.status, 200);
    const itOnlyJson = await itOnlyRes.json();
    assert.deepEqual(
      itOnlyJson.incidents.map((r: any) => r.id),
      [itInc.id]
    );
  });

  it('excludes External User cases from MTTR, counts externalUserCount, and filters analytics + CSV export', async () => {
    const tag = `EXTMTTR-${Date.now()}`;
    const extInc = await IncidentService.createIncident({
      reporterName: 'Prd User',
      department: tag,
      contactInfo: 'ext 201',
      title: `${tag} External holiday fix`,
      description: 'Solved by Prd Sup after 4 hours',
      urgency: 'MEDIUM',
      category: 'Hardware',
    });
    const itInc = await IncidentService.createIncident({
      reporterName: 'Sales User',
      department: tag,
      contactInfo: 'ext 202',
      title: `${tag} Internal IT fix`,
      description: 'Solved by IT in 30 mins',
      urgency: 'MEDIUM',
      category: 'Hardware',
    });
    createdIncidentIds.push(extInc.id, itInc.id);

    const baseCreated = new Date('2026-11-20T08:00:00.000Z');
    await IncidentService.updateIncident(extInc.id, {
      status: 'RESOLVED',
      rootCause: 'System > Program Defect',
      resolution: 'External vendor restarted line controller',
      resolvedByExternal: true,
      createdAt: baseCreated,
      closedAt: new Date(baseCreated.getTime() + 240 * 60000),
    });
    await IncidentService.updateIncident(itInc.id, {
      status: 'RESOLVED',
      assignedTo: 'IT Support',
      rootCause: 'System > Program Defect',
      resolution: 'IT Support applied network patch',
      resolvedByExternal: false,
      createdAt: baseCreated,
      closedAt: new Date(baseCreated.getTime() + 30 * 60000),
    });

    const allAnalyticsRes = await analyticsGet(
      await makeAuthReq(`http://localhost/api/incidents/analytics?department=${encodeURIComponent(tag)}`)
    );
    assert.equal(allAnalyticsRes.status, 200);
    const allAnalytics = await allAnalyticsRes.json();
    assert.equal(allAnalytics.summary.total, 2);
    assert.equal(allAnalytics.summary.externalUserCount, 1);
    assert.equal(allAnalytics.summary.avgResolutionMins, 30);

    const extAnalyticsRes = await analyticsGet(
      await makeAuthReq(`http://localhost/api/incidents/analytics?department=${encodeURIComponent(tag)}&resolvedByExternal=true`)
    );
    assert.equal(extAnalyticsRes.status, 200);
    const extAnalytics = await extAnalyticsRes.json();
    assert.equal(extAnalytics.summary.total, 1);
    assert.equal(extAnalytics.summary.externalUserCount, 1);

    const exportRes = await exportGet(
      await makeAuthReq(`http://localhost/api/incidents/export?department=${encodeURIComponent(tag)}&resolvedByExternal=true`)
    );
    assert.equal(exportRes.status, 200);
    const csvText = await exportRes.text();
    assert.match(csvText, /"External User"/);
    assert.ok(csvText.includes(extInc.ticketNo));
    assert.ok(!csvText.includes(itInc.ticketNo));
    assert.match(csvText, /"Yes"/);
  });

  it('imports CSV with External User column and preserves legacy CSVs without it', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-csv-'));
    try {
      const legacyTicket = 'INC-202611-9991';
      const extTicket = 'INC-202611-9992';

      const legacyCsvPath = path.join(tmpDir, 'legacy.csv');
      fs.writeFileSync(
        legacyCsvPath,
        [
          'Ticket No,Title,Description,Status,Category,Reporter Name,Department,Contact Info',
          `${legacyTicket},Legacy CSV Row,No external column,OPEN,Hardware,Tester,IT,ext 991`,
        ].join('\n'),
        'utf8'
      );
      await importIncidentsFromCsv(legacyCsvPath);
      const legacyRow = await IncidentService.getIncidentById(legacyTicket);
      assert.ok(legacyRow);
      createdIncidentIds.push(legacyRow.id);
      assert.equal((legacyRow as any).resolvedByExternal, false);
      assert.equal(legacyRow.mttrExcluded, false);

      const extCsvPath = path.join(tmpDir, 'external.csv');
      fs.writeFileSync(
        extCsvPath,
        [
          'Ticket No,Title,Description,Status,Category,Root Cause,Reporter Name,Department,Contact Info,External User',
          `${extTicket},Holiday CSV Row,Fixed by Prd Sup,RESOLVED,Hardware,System,Prd User,Production,ext 992,Yes`,
        ].join('\n'),
        'utf8'
      );
      await importIncidentsFromCsv(extCsvPath);
      const extRow = await IncidentService.getIncidentById(extTicket);
      assert.ok(extRow);
      createdIncidentIds.push(extRow.id);
      assert.equal((extRow as any).resolvedByExternal, true);
      assert.equal(extRow.mttrExcluded, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
