import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import prisma from '../src/lib/prisma';
import { CategoryService } from '../src/lib/services/category.service';
import { IncidentService } from '../src/lib/services/incident.service';
import { IncidentAnalyticsService } from '../src/lib/services/incident-analytics.service';
import { IncidentServiceError } from '../src/lib/services/incident-errors';
import { RootCauseService } from '../src/lib/services/root-cause.service';
import { IntegrationService } from '../src/lib/services/integration.service';
import { isImageAttachment, isPdfAttachment } from '../src/lib/attachments';
import { ADMIN_COOKIE_NAME, createAdminSessionToken } from '../src/lib/auth';
import { GET as exportCsvHandler } from '../src/app/api/incidents/export/route';
import { POST as incidentsPostHandler } from '../src/app/api/incidents/route';
import { GET as inboundGetHandler, POST as inboundPostHandler } from '../src/app/api/incidents/inbound/route';
import { GET as incidentGetHandler, PATCH as incidentPatchHandler } from '../src/app/api/incidents/[id]/route';
import { POST as attachmentsPostHandler, DELETE as attachmentsDeleteHandler } from '../src/app/api/incidents/[id]/attachments/route';
import { GET as analyticsGetHandler } from '../src/app/api/incidents/analytics/route';
import { GET as departmentsGetHandler } from '../src/app/api/departments/route';
import { GET as rootCausesGet, POST as rootCausesPost, DELETE as rootCausesDelete } from '../src/app/api/root-causes/route';

describe('7. Category, Incident Lifecycle, Analytics & Excel Export', () => {
  const testCategoryIds: string[] = [];
  const testIncidentIds: string[] = [];
  const testTicketNos: string[] = [];
  let initialTeamsEnabled = true;

  before(async () => {
    const raw = await IntegrationService.getRawConfig();
    initialTeamsEnabled = raw.teams.isEnabled;
    // Disable live webhook network call during unit/integration test
    await IntegrationService.saveTeamsConfig({ isEnabled: false });
  });

  after(async () => {
    await new Promise((r) => setTimeout(r, 150));
    await IntegrationService.saveTeamsConfig({ isEnabled: initialTeamsEnabled });
    if (testTicketNos.length > 0) {
      await prisma.notificationLog.deleteMany({ where: { ticketNo: { in: testTicketNos } } });
    }
    if (testIncidentIds.length > 0) {
      for (const id of testIncidentIds) {
        await IncidentService.setMttrExcluded(id, false);
      }
      await prisma.incident.deleteMany({ where: { id: { in: testIncidentIds } } });
    }
    if (testCategoryIds.length > 0) {
      await prisma.category.deleteMany({ where: { id: { in: testCategoryIds } } });
    }
  });

  it('creates, updates, and queries categories via CategoryService', async () => {
    const uniqueName = `Test Cloud Infra ${Date.now()}`;
    const created = await CategoryService.createCategory({
      name: uniqueName,
      description: 'Automated test category',
      color: '#10b981',
    });
    testCategoryIds.push(created.id);

    assert.equal(created.name, uniqueName);
    assert.ok(created.slug.startsWith('test-cloud-infra-'));

    const updated = await CategoryService.updateCategory(created.id, { isActive: false });
    assert.equal(updated.isActive, false);

    const activeList = await CategoryService.getActiveCategories();
    assert.ok(!activeList.some((c) => c.id === created.id), 'Inactive category should not appear in active list');
  });

  it('creates, filters, updates, and resolves an incident with automatic closedAt timestamp', async () => {
    const created = await IncidentService.createIncident({
      reporterName: 'กิตติพงศ์ ทดสอบระบบ',
      department: 'QA Engineering',
      contactInfo: 'kittipong.qa@company.com',
      title: '<b>ทดสอบแจ้งปัญหา VPN หลุดบ่อย</b>',
      description: 'ไม่สามารถเชื่อมต่อเครือข่ายภายในได้ตั้งแต่ 09:00 น.',
      urgency: 'HIGH',
      category: 'Network / VPN',
    });
    testIncidentIds.push(created.id);
    testTicketNos.push(created.ticketNo);

    assert.match(created.ticketNo, /^INC-\d{6}-\d{3}$/);
    assert.equal(created.status, 'OPEN');
    assert.equal(created.title, 'ทดสอบแจ้งปัญหา VPN หลุดบ่อย', 'HTML tags must be stripped on creation');

    // Fetch by ticketNo
    const fetched = await IncidentService.getIncidentById(created.ticketNo);
    assert.ok(fetched);
    assert.equal(fetched.id, created.id);

    // Filter by search term
    const searchResult = await IncidentService.getIncidents({
      search: created.ticketNo,
      urgency: 'HIGH',
    });
    assert.equal(searchResult.incidents.length, 1);
    assert.equal(searchResult.incidents[0].ticketNo, created.ticketNo);

    // Edit title and description (when user wrote poorly)
    const edited = await IncidentService.updateIncident(created.ticketNo, {
      title: 'VPN Core Gateway Timeout (Corrected by Admin)',
      description: 'ปรับปรุงรายละเอียด: ปัญหาเกิดจาก Gateway Session ค้างและ MTU mismatch',
    });
    assert.equal(edited.title, 'VPN Core Gateway Timeout (Corrected by Admin)');
    assert.equal(edited.description, 'ปรับปรุงรายละเอียด: ปัญหาเกิดจาก Gateway Session ค้างและ MTU mismatch');

    // Resolve incident via ticketNo (same path used by PATCH /api/incidents/[id])
    const resolved = await IncidentService.updateIncident(created.ticketNo, {
      status: 'RESOLVED',
      rootCause: 'System',
      assignedTo: 'Tier-2 Network Admin',
      resolution: '<p>รีเซ็ต BGP Session และอัปเดต Profile เรียบร้อย</p>',
    });

    assert.equal(resolved.status, 'RESOLVED');
    assert.ok(resolved.closedAt, 'closedAt timestamp must be populated automatically when RESOLVED');
    assert.equal(resolved.resolution, 'รีเซ็ต BGP Session และอัปเดต Profile เรียบร้อย');
  });

  it('aggregates 4-dimension analytics dataset accurately', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const analytics = await IncidentService.getAnalyticsData({
      startDate: today,
      endDate: today,
    });

    assert.ok(analytics.summary.total >= 1);
    assert.ok(Array.isArray(analytics.trend));
    assert.ok(Array.isArray(analytics.byCategory));
    assert.ok(Array.isArray(analytics.byDepartment));
    assert.equal(analytics.byStatus.length, 6);
    assert.ok(analytics.byStatus.some((s) => s.status === 'PENDING_CONFIRM'));
    assert.ok(analytics.byStatus.some((s) => s.status === 'ON_HOLD'));
    assert.equal(analytics.byUrgency.length, 3);
  });

  it('blocks unauthenticated Excel export (401) and exports UTF-8 BOM CSV for Admin', async () => {
    // 1. Unauthenticated request -> 401
    const unauthReq = new NextRequest('http://localhost:3000/api/incidents/export');
    const unauthRes = await exportCsvHandler(unauthReq);
    assert.equal(unauthRes.status, 401);

    // 2. Authenticated Admin request -> 200 CSV with UTF-8 BOM
    const adminToken = await createAdminSessionToken();
    const authReq = new NextRequest('http://localhost:3000/api/incidents/export?department=QA+Engineering', {
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    const authRes = await exportCsvHandler(authReq);
    assert.equal(authRes.status, 200);
    assert.match(authRes.headers.get('content-type') || '', /text\/csv/);

    const rawBytes = new Uint8Array(await authRes.arrayBuffer());
    assert.deepEqual(
      Array.from(rawBytes.slice(0, 3)),
      [0xef, 0xbb, 0xbf],
      'CSV binary stream must start with UTF-8 BOM (0xEF 0xBB 0xBF) for Excel Thai support'
    );
    const csvText = new TextDecoder('utf-8').decode(rawBytes);
    assert.ok(csvText.includes('"Ticket No","Created At","Urgency"'));
    assert.ok(csvText.includes('กิตติพงศ์ ทดสอบระบบ'));
  });

  it('provides documentation on GET /api/incidents/inbound and creates incidents with Smart Mapping on POST', async () => {
    // 1. GET doc
    const docRes = await inboundGetHandler();
    assert.equal(docRes.status, 200);
    const doc = await docRes.json();
    assert.equal(doc.endpoint, '/api/incidents/inbound');

    // 2. POST with smart mapping (summary, detail, severity, sourceSystem)
    const adminToken = await createAdminSessionToken();
    const inboundReq = new NextRequest('http://localhost:3000/api/incidents/inbound', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({
        summary: 'Core Switch STP Loop Detected',
        detail: 'Broadcast storm detected on VLAN 20 port Gi1/0/24',
        severity: 'CRITICAL',
        sourceSystem: 'Zabbix NOC Alerting',
        environment: 'Datacenter BKK',
        category: 'Network / VPN',
      }),
    });

    const createRes = await inboundPostHandler(inboundReq);
    assert.equal(createRes.status, 201);
    const createData = await createRes.json();
    assert.equal(createData.success, true);
    assert.match(createData.ticketNo, /^INC-\d{6}-\d{3}$/);
    assert.equal(createData.urgency, 'HIGH', 'CRITICAL severity must map to HIGH urgency');

    testIncidentIds.push(createData.id);
    testTicketNos.push(createData.ticketNo);

    // Verify persisted in SQLite
    const inDb = await prisma.incident.findUnique({ where: { id: createData.id } });
    assert.ok(inDb);
    assert.equal(inDb.title, 'Core Switch STP Loop Detected');
    assert.equal(inDb.reporterName, 'Zabbix NOC Alerting');
  });

  it('allows Admin to edit closedAt on resolved/closed incidents and validates bounds', async () => {
    const ticketNo = testTicketNos[0];
    const existing = await IncidentService.getIncidentById(ticketNo);
    assert.ok(existing);

    const adminToken = await createAdminSessionToken();
    const customClosedAt = new Date(existing.createdAt.getTime() + 90 * 60 * 1000).toISOString();

    const validReq = new NextRequest(`http://localhost:3000/api/incidents/${ticketNo}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({ closedAt: customClosedAt }),
    });
    const validRes = await incidentPatchHandler(validReq, { params: Promise.resolve({ id: ticketNo }) });
    assert.equal(validRes.status, 200);
    const updated = await validRes.json();
    assert.equal(new Date(updated.closedAt).toISOString(), customClosedAt);

    // Reject closedAt earlier than createdAt
    const earlierIso = new Date(existing.createdAt.getTime() - 60 * 1000).toISOString();
    const invalidReq = new NextRequest(`http://localhost:3000/api/incidents/${ticketNo}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({ closedAt: earlierIso }),
    });
    const invalidRes = await incidentPatchHandler(invalidReq, { params: Promise.resolve({ id: ticketNo }) });
    assert.equal(invalidRes.status, 400);

    // Allow Admin to edit createdAt (start date) earlier than closedAt, reject later than closedAt
    const customCreatedAt = new Date(existing.createdAt.getTime() - 30 * 60 * 1000).toISOString();
    const validCreatedReq = new NextRequest(`http://localhost:3000/api/incidents/${ticketNo}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({ createdAt: customCreatedAt }),
    });
    const validCreatedRes = await incidentPatchHandler(validCreatedReq, { params: Promise.resolve({ id: ticketNo }) });
    assert.equal(validCreatedRes.status, 200);
    const updatedCreated = await validCreatedRes.json();
    assert.equal(new Date(updatedCreated.createdAt).toISOString(), customCreatedAt);

    const afterClosedIso = new Date(new Date(customClosedAt).getTime() + 60 * 1000).toISOString();
    const invalidCreatedReq = new NextRequest(`http://localhost:3000/api/incidents/${ticketNo}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({ createdAt: afterClosedIso }),
    });
    const invalidCreatedRes = await incidentPatchHandler(invalidCreatedReq, { params: Promise.resolve({ id: ticketNo }) });
    assert.equal(invalidCreatedRes.status, 400);

    // Preserves custom closedAt when transitioning RESOLVED -> CLOSED, clears on OPEN
    const closedStatus = await IncidentService.updateIncident(ticketNo, { status: 'CLOSED' });
    assert.equal(closedStatus.closedAt?.toISOString(), customClosedAt);

    const reopened = await IncidentService.updateIncident(ticketNo, { status: 'OPEN' });
    assert.equal(reopened.closedAt, null);
  });

  it('serves fresh analytics with no-store headers and consistent status/urgency totals', async () => {
    const adminToken = await createAdminSessionToken();
    const fetchAnalytics = async () => {
      const req = new NextRequest('http://localhost:3000/api/incidents/analytics', {
        headers: { cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      });
      const res = await analyticsGetHandler(req);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'no-store, max-age=0');
      return res.json();
    };

    const beforeData = await fetchAnalytics();
    const statusSum = beforeData.byStatus.reduce((acc: number, s: { count: number }) => acc + s.count, 0);
    const urgencySum = beforeData.byUrgency.reduce((acc: number, u: { count: number }) => acc + u.count, 0);
    assert.equal(statusSum, beforeData.summary.total);
    assert.equal(urgencySum, beforeData.summary.total);

    const openBefore = beforeData.byStatus.find((s: { status: string }) => s.status === 'OPEN')?.count ?? 0;
    const resolvedBefore = beforeData.byStatus.find((s: { status: string }) => s.status === 'RESOLVED')?.count ?? 0;

    // Resolve the reopened test ticket and verify analytics updates immediately
    await IncidentService.updateIncident(testTicketNos[0], { status: 'RESOLVED' });
    const afterData = await fetchAnalytics();
    const openAfter = afterData.byStatus.find((s: { status: string }) => s.status === 'OPEN')?.count ?? 0;
    const resolvedAfter = afterData.byStatus.find((s: { status: string }) => s.status === 'RESOLVED')?.count ?? 0;

    assert.equal(openAfter, openBefore - 1);
    assert.equal(resolvedAfter, resolvedBefore + 1);
  });

  it('sorts OPEN -> IN_PROGRESS -> RESOLVED/CLOSED with urgency priority across pagination and supports ACTIVE filter', async () => {
    const tag = `QP-${Date.now()}`;
    const mk = async (title: string, urgency: 'LOW' | 'MEDIUM' | 'HIGH', status?: string) => {
      const inc = await IncidentService.createIncident({
        reporterName: 'Queue Tester',
        contactInfo: 'qp@test.local',
        title: `${tag} ${title}`,
        description: 'Queue sorting test',
        urgency,
      });
      testIncidentIds.push(inc.id);
      if (status) {
        await IncidentService.updateIncident(inc.ticketNo, {
          status,
          category: 'Helpdesk',
          rootCause: 'Human',
        });
      }
      return inc.ticketNo;
    };

    const openLow = await mk('open-low', 'LOW');
    const openHigh = await mk('open-high', 'HIGH');
    const inProg = await mk('in-progress', 'MEDIUM', 'IN_PROGRESS');
    const resolvedNewest = await mk('resolved-newest', 'HIGH', 'RESOLVED');

    const page1 = await IncidentService.getIncidents({ search: tag, page: 1, limit: 2 });
    const page2 = await IncidentService.getIncidents({ search: tag, page: 2, limit: 2 });

    assert.deepEqual(
      page1.incidents.map((i) => i.ticketNo),
      [openHigh, openLow]
    );
    assert.deepEqual(
      page2.incidents.map((i) => i.ticketNo),
      [inProg, resolvedNewest]
    );

    const activeOnly = await IncidentService.getIncidents({ search: tag, status: 'ACTIVE', limit: 10 });
    assert.deepEqual(
      activeOnly.incidents.map((i) => i.ticketNo),
      [openHigh, openLow, inProg]
    );
  });

  it('computes MTTR breakdown, backlog aging buckets, and global urgency/category/department filters', async () => {
    const adminToken = await createAdminSessionToken();
    const req = new NextRequest('http://localhost:3000/api/incidents/analytics?urgency=HIGH', {
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    const res = await analyticsGetHandler(req);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.byUrgency.find((u: { urgency: string }) => u.urgency === 'MEDIUM')?.count, 0);
    assert.equal(data.byUrgency.find((u: { urgency: string }) => u.urgency === 'LOW')?.count, 0);
    assert.equal(data.mttrByUrgency.length, 3);
    assert.ok(Array.isArray(data.mttrByCategory));
    assert.equal(data.backlogAging.length, 4);

    const agingSum = data.backlogAging.reduce((acc: number, b: { count: number }) => acc + b.count, 0);
    assert.equal(agingSum, data.summary.openCount + data.summary.inProgressCount);
    assert.ok(Array.isArray(data.filterOptions?.categories));
    assert.ok(Array.isArray(data.filterOptions?.departments));
  });

  it('normalizes and groups mixed-case department names consistently', async () => {
    assert.equal(IncidentService.normalizeDepartment('  it '), 'IT');
    assert.equal(IncidentService.normalizeDepartment('qa'), 'QA');
    assert.equal(IncidentService.normalizeDepartment('accounting'), 'Accounting');
    assert.equal(IncidentService.normalizeDepartment('QA Engineering'), 'QA Engineering');

    const deptTag = `DeptMix${Date.now()}`;
    const mkRaw = async (rawDept: string) => {
      const created = await IncidentService.createIncident({
        reporterName: 'Dept Tester',
        contactInfo: 'dept@test.local',
        department: rawDept,
        title: `Dept test ${rawDept}`,
        description: 'Testing mixed case department grouping',
      });
      testIncidentIds.push(created.id);
      return created;
    };

    const a = await mkRaw(`${deptTag}`);
    // Simulate legacy DB row stored with lowercase variant before normalization
    const b = await prisma.incident.create({
      data: {
        ticketNo: `INC-999999-${String(Math.floor(Math.random() * 900) + 100)}`,
        reporterName: 'Dept Tester',
        contactInfo: 'dept@test.local',
        department: deptTag.toLowerCase(),
        title: 'Legacy lowercase dept',
        description: 'Testing legacy casing merge',
      },
    });
    testIncidentIds.push(b.id);

    const analytics = await IncidentService.getAnalyticsData({ department: deptTag });
    assert.equal(analytics.summary.total, 2, 'Department filter must match mixed-case rows');
    assert.equal(analytics.byDepartment.length, 1, 'Mixed-case departments must merge into 1 entry');
    assert.equal(analytics.byDepartment[0].count, 2);
    assert.equal(
      analytics.filterOptions.departments.filter((d) => d.toLowerCase() === deptTag.toLowerCase()).length,
      1
    );
    assert.ok(a.department);
  });

  it('supports ON_HOLD status, excludes from backlog aging and MTTR even after resolving, and allows toggling', async () => {
    const dept = `HoldTest${Date.now()}`;
    const fast = await IncidentService.createIncident({
      reporterName: 'Hold Tester',
      contactInfo: 'hold@test.local',
      department: dept,
      title: 'Fast fix',
      description: 'Solved in 30m',
      urgency: 'MEDIUM',
    });
    const held = await IncidentService.createIncident({
      reporterName: 'Hold Tester',
      contactInfo: 'hold@test.local',
      department: dept,
      title: 'No solution yet',
      description: 'Waiting vendor',
      urgency: 'HIGH',
    });
    testIncidentIds.push(fast.id, held.id);

    await IncidentService.updateIncident(fast.ticketNo, {
      status: 'RESOLVED',
      category: 'Helpdesk',
      rootCause: 'Human',
      closedAt: new Date(fast.createdAt.getTime() + 30 * 60 * 1000),
    });

    const onHold = await IncidentService.updateIncident(held.ticketNo, { status: 'ON_HOLD' });
    assert.equal(onHold.status, 'ON_HOLD');
    assert.equal(onHold.closedAt, null);
    assert.equal(onHold.mttrExcluded, true);

    const midStats = await IncidentService.getAnalyticsData({ department: dept });
    assert.equal(midStats.summary.onHoldCount, 1);
    assert.equal(midStats.backlogAging.reduce((s, b) => s + b.count, 0), 0, 'ON_HOLD must not appear in backlog aging');
    assert.equal(midStats.summary.avgResolutionMins, 30);

    // Queue order puts ON_HOLD before RESOLVED
    const queue = await IncidentService.getIncidents({ department: dept, limit: 10 });
    assert.deepEqual(
      queue.incidents.map((i) => i.ticketNo),
      [held.ticketNo, fast.ticketNo]
    );

    // Resolving after 10 days still keeps mttrExcluded=true so MTTR stays 30m
    const resolvedAfterHold = await IncidentService.updateIncident(held.ticketNo, {
      status: 'RESOLVED',
      category: 'Interface',
      rootCause: 'Data',
      closedAt: new Date(held.createdAt.getTime() + 10 * 24 * 60 * 60 * 1000),
    });
    assert.equal(resolvedAfterHold.mttrExcluded, true);

    const afterStats = await IncidentService.getAnalyticsData({ department: dept });
    assert.equal(afterStats.summary.avgResolutionMins, 30);

    // Admin can toggle mttrExcluded off via PATCH API
    const adminToken = await createAdminSessionToken();
    const toggleReq = new NextRequest(`http://localhost:3000/api/incidents/${held.ticketNo}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
      },
      body: JSON.stringify({ mttrExcluded: false }),
    });
    const toggleRes = await incidentPatchHandler(toggleReq, { params: Promise.resolve({ id: held.ticketNo }) });
    assert.equal(toggleRes.status, 200);
    const toggled = await toggleRes.json();
    assert.equal(toggled.mttrExcluded, false);

    const includedStats = await IncidentService.getAnalyticsData({ department: dept });
    assert.ok(includedStats.summary.avgResolutionMins > 30);
  });

  it('requires both category and rootCause before closing, supports custom root causes, and aggregates byRootCause', async () => {
    const adminToken = await createAdminSessionToken();
    const customName = `Vendor-${Date.now()}`;

    // 1. Custom root cause options CRUD
    const addRes = await rootCausesPost(
      new NextRequest('http://localhost:3000/api/root-causes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
        body: JSON.stringify({ name: customName }),
      })
    );
    assert.equal(addRes.status, 201);
    const listRes = await rootCausesGet();
    const options = await listRes.json();
    assert.ok(options.includes('Human') && options.includes('System') && options.includes('Data'));
    assert.ok(options.includes(customName));

    // 2. Reject closing without category and rootCause
    const inc = await IncidentService.createIncident({
      reporterName: 'RCA Tester',
      contactInfo: 'rca@test.local',
      department: `RCADept${Date.now()}`,
      title: 'Missing category & rootCause test',
      description: 'Should fail close without both categories',
    });
    testIncidentIds.push(inc.id);

    const failCloseBoth = await incidentPatchHandler(
      new NextRequest(`http://localhost:3000/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
        body: JSON.stringify({ status: 'RESOLVED' }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(failCloseBoth.status, 400);

    // Reject closing with category set but rootCause missing
    const failNoRootCause = await incidentPatchHandler(
      new NextRequest(`http://localhost:3000/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
        body: JSON.stringify({ status: 'CLOSED', category: 'SAP Basis' }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(failNoRootCause.status, 400);

    // 3. Succeeds when both category and rootCause are provided
    const okClose = await incidentPatchHandler(
      new NextRequest(`http://localhost:3000/api/incidents/${inc.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
        body: JSON.stringify({ status: 'RESOLVED', category: 'SAP Basis', rootCause: customName }),
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(okClose.status, 200);
    const closedData = await okClose.json();
    assert.equal(closedData.rootCause, customName);

    // 4. Analytics breakdown & filter by rootCause
    const rcAnalytics = await IncidentService.getAnalyticsData({ rootCause: customName });
    assert.equal(rcAnalytics.summary.total, 1);
    assert.equal(rcAnalytics.byRootCause?.[0].rootCause, customName);

    // Cleanup custom root cause option
    const delRes = await rootCausesDelete(
      new NextRequest(`http://localhost:3000/api/root-causes?name=${encodeURIComponent(customName)}`, {
        method: 'DELETE',
        headers: { cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
      })
    );
    assert.equal(delRes.status, 200);
  });

  it('allows admin to upload and delete REPORT vs RESOLUTION attachments separately', async () => {
    const adminToken = await createAdminSessionToken();
    const cookieHeader = `${ADMIN_COOKIE_NAME}=${adminToken}`;

    const inc = await IncidentService.createIncident({
      reporterName: 'Photo Tester',
      contactInfo: 'photo@test.local',
      title: 'Delayed attachment & closure photo test',
      description: 'Reporter forgot image initially',
    });
    const otherInc = await IncidentService.createIncident({
      reporterName: 'Other Tester',
      contactInfo: 'other@test.local',
      title: 'Another incident',
      description: 'Isolation test',
    });
    testIncidentIds.push(inc.id, otherInc.id);

    // 1. Unauthenticated upload rejected
    const fdUnauth = new FormData();
    fdUnauth.append('file', new File([Buffer.from('fake-png')], 'a.png', { type: 'image/png' }));
    const unauthRes = await attachmentsPostHandler(
      new NextRequest(`http://localhost:3000/api/incidents/${inc.ticketNo}/attachments`, {
        method: 'POST',
        body: fdUnauth,
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(unauthRes.status, 401);

    // 2. Disallowed file extension rejected (400)
    const fdBad = new FormData();
    fdBad.append('file', new File([Buffer.from('<script>alert(1)</script>')], 'payload.html', { type: 'text/html' }));
    const badRes = await attachmentsPostHandler(
      new NextRequest(`http://localhost:3000/api/incidents/${inc.ticketNo}/attachments`, {
        method: 'POST',
        headers: { cookie: cookieHeader },
        body: fdBad,
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(badRes.status, 400);

    // 3. Upload REPORT and RESOLUTION images
    const upload = async (name: string, kind: 'REPORT' | 'RESOLUTION') => {
      const fd = new FormData();
      fd.append('file', new File([Buffer.from('PNGDATA')], name, { type: 'image/png' }));
      fd.append('kind', kind);
      const res = await attachmentsPostHandler(
        new NextRequest(`http://localhost:3000/api/incidents/${inc.ticketNo}/attachments`, {
          method: 'POST',
          headers: { cookie: cookieHeader },
          body: fd,
        }),
        { params: Promise.resolve({ id: inc.ticketNo }) }
      );
      assert.equal(res.status, 201);
      return res.json();
    };

    const reportAtt = await upload('reporter-late.png', 'REPORT');
    const resolutionAtt = await upload('fixed-proof.png', 'RESOLUTION');
    assert.equal(reportAtt.kind, 'REPORT');
    assert.equal(resolutionAtt.kind, 'RESOLUTION');

    // Assert hierarchical path structure: /uploads/YYYY/MM/<ticketNo>/<kind>_<timestamp>_<filename>
    const expectedPrefix = new RegExp(`^/uploads/\\d{4}/\\d{2}/${inc.ticketNo}/`);
    assert.ok(expectedPrefix.test(reportAtt.fileUrl), `report fileUrl should follow nested structure, got: ${reportAtt.fileUrl}`);
    assert.ok(reportAtt.fileUrl.includes('/report_'), `report filename should be prefixed with report_`);
    assert.ok(!reportAtt.fileUrl.includes('\\'), 'fileUrl must use forward slashes only');

    assert.ok(expectedPrefix.test(resolutionAtt.fileUrl), `resolution fileUrl should follow nested structure, got: ${resolutionAtt.fileUrl}`);
    assert.ok(resolutionAtt.fileUrl.includes('/resolution_'), `resolution filename should be prefixed with resolution_`);
    assert.ok(!resolutionAtt.fileUrl.includes('\\'), 'fileUrl must use forward slashes only');

    const detailRes = await incidentGetHandler(
      new NextRequest(`http://localhost:3000/api/incidents/${inc.ticketNo}`, {
        headers: { cookie: cookieHeader },
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(detailRes.status, 200);
    const detail = await detailRes.json();
    assert.equal(detail.attachments.filter((a: any) => a.kind === 'REPORT').length, 1);
    assert.equal(detail.attachments.filter((a: any) => a.kind === 'RESOLUTION').length, 1);

    // 4. Cannot delete attachment via another incident ID
    const crossDelRes = await attachmentsDeleteHandler(
      new NextRequest(
        `http://localhost:3000/api/incidents/${otherInc.ticketNo}/attachments?attachmentId=${reportAtt.id}`,
        { method: 'DELETE', headers: { cookie: cookieHeader } }
      ),
      { params: Promise.resolve({ id: otherInc.ticketNo }) }
    );
    assert.equal(crossDelRes.status, 404);

    // 5. Cleanup both uploaded files via DELETE endpoint
    const uploadsRoot = (IncidentService as any).getUploadsRoot
      ? (IncidentService as any).getUploadsRoot()
      : path.join(process.cwd(), 'public', 'uploads');

    for (const att of [reportAtt, resolutionAtt]) {
      const relSegments = att.fileUrl.replace(/^\/uploads\//, '').split('/');
      const storedPath = path.join(uploadsRoot, ...relSegments);
      assert.ok(fs.existsSync(storedPath), `Uploaded file should exist on disk before delete: ${storedPath}`);
      const delAttRes = await attachmentsDeleteHandler(
        new NextRequest(
          `http://localhost:3000/api/incidents/${inc.ticketNo}/attachments?attachmentId=${att.id}`,
          { method: 'DELETE', headers: { cookie: cookieHeader } }
        ),
        { params: Promise.resolve({ id: inc.ticketNo }) }
      );
      assert.equal(delAttRes.status, 200);
      assert.equal(fs.existsSync(storedPath), false, 'Uploaded file should be unlinked on delete');
    }

    // 6. Verify deleting a legacy flat attachment still unlinks cleanly
    const legacyFlatPath = path.join(uploadsRoot, 'legacy_compat_test.png');
    await fs.promises.writeFile(legacyFlatPath, Buffer.from('LEGACY'));
    const legacyAtt = await prisma.attachment.create({
      data: {
        incidentId: inc.id,
        fileUrl: '/uploads/legacy_compat_test.png',
        fileName: 'legacy_compat_test.png',
        fileType: 'image/png',
        fileSize: 6,
        kind: 'REPORT',
      },
    });
    const delLegacyRes = await attachmentsDeleteHandler(
      new NextRequest(
        `http://localhost:3000/api/incidents/${inc.ticketNo}/attachments?attachmentId=${legacyAtt.id}`,
        { method: 'DELETE', headers: { cookie: cookieHeader } }
      ),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(delLegacyRes.status, 200);
    assert.equal(fs.existsSync(legacyFlatPath), false, 'Legacy flat file should be unlinked on delete');
  });

  it('handles concurrent incident creation without ticketNo P2002 collision', async () => {
    const batch = await Promise.all(
      [1, 2, 3, 4].map((idx) =>
        IncidentService.createIncident({
          reporterName: `Concurrent ${idx}`,
          contactInfo: 'conc@test.local',
          title: `Concurrent test #${idx}`,
          description: 'Verifies P2002 ticketNo retry handler',
        })
      )
    );
    batch.forEach((inc) => testIncidentIds.push(inc.id));
    const uniqueTickets = new Set(batch.map((b) => b.ticketNo));
    assert.equal(uniqueTickets.size, 4);
  });

  it('links multiple related incidents, resolves referencedBy, validates errors, and exports Related Tickets', async () => {
    const adminToken = await createAdminSessionToken();
    const cookieHeader = `${ADMIN_COOKIE_NAME}=${adminToken}`;

    const oldA = await IncidentService.createIncident({
      reporterName: 'Ref A',
      contactInfo: 'a@test.local',
      title: 'Old Incident A',
      description: 'First historical case',
    });
    const oldB = await IncidentService.createIncident({
      reporterName: 'Ref B',
      contactInfo: 'b@test.local',
      title: 'Old Incident B',
      description: 'Second historical case',
    });
    const current = await IncidentService.createIncident({
      reporterName: 'Ref Current',
      contactInfo: 'cur@test.local',
      title: 'Recurring Incident',
      description: 'Links back to A and B',
    });
    testIncidentIds.push(oldA.id, oldB.id, current.id);

    // 1. Reject self-reference (400)
    const selfRes = await incidentPatchHandler(
      new NextRequest(`http://localhost:3000/api/incidents/${current.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: cookieHeader },
        body: JSON.stringify({ relatedTickets: [current.ticketNo] }),
      }),
      { params: Promise.resolve({ id: current.ticketNo }) }
    );
    assert.equal(selfRes.status, 400);

    // 2. Reject non-existent referenced ticket (400)
    const missingRes = await incidentPatchHandler(
      new NextRequest(`http://localhost:3000/api/incidents/${current.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: cookieHeader },
        body: JSON.stringify({ relatedTickets: ['INC-999999-999'] }),
      }),
      { params: Promise.resolve({ id: current.ticketNo }) }
    );
    assert.equal(missingRes.status, 400);

    // 3. Link multiple tickets (deduplicated, order preserved)
    const linkRes = await incidentPatchHandler(
      new NextRequest(`http://localhost:3000/api/incidents/${current.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: cookieHeader },
        body: JSON.stringify({ relatedTickets: [oldB.ticketNo, oldA.ticketNo, oldB.ticketNo] }),
      }),
      { params: Promise.resolve({ id: current.ticketNo }) }
    );
    assert.equal(linkRes.status, 200);
    const linked = await linkRes.json();
    assert.deepEqual(linked.relatedTicketNos, [oldB.ticketNo, oldA.ticketNo]);
    assert.deepEqual(
      linked.relatedIncidents.map((r: any) => r.ticketNo),
      [oldB.ticketNo, oldA.ticketNo]
    );

    // 4. Reverse lookup on oldA returns current in referencedBy
    const oldADetailRes = await incidentGetHandler(
      new NextRequest(`http://localhost:3000/api/incidents/${oldA.ticketNo}`, {
        headers: { cookie: cookieHeader },
      }),
      { params: Promise.resolve({ id: oldA.ticketNo }) }
    );
    assert.equal(oldADetailRes.status, 200);
    const oldADetail = await oldADetailRes.json();
    assert.ok(oldADetail.referencedBy.some((r: any) => r.ticketNo === current.ticketNo));

    // 5. Export CSV includes Related Tickets column with linked tickets
    const exportRes = await exportCsvHandler(
      new NextRequest(`http://localhost:3000/api/incidents/export?search=${encodeURIComponent(current.ticketNo)}`, {
        headers: { cookie: cookieHeader },
      })
    );
    assert.equal(exportRes.status, 200);
    const csvText = await exportRes.text();
    assert.ok(csvText.includes('Related Tickets'));
    assert.ok(csvText.includes(`${oldB.ticketNo}, ${oldA.ticketNo}`));

    // 6. Unlink all references clears relatedTickets to null
    const clearRes = await incidentPatchHandler(
      new NextRequest(`http://localhost:3000/api/incidents/${current.ticketNo}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: cookieHeader },
        body: JSON.stringify({ relatedTickets: [] }),
      }),
      { params: Promise.resolve({ id: current.ticketNo }) }
    );
    assert.equal(clearRes.status, 200);
    const cleared = await clearRes.json();
    assert.deepEqual(cleared.relatedTicketNos, []);
    assert.equal(cleared.relatedTickets, null);
  });

  it('lists canonical deduplicated departments and supports case-insensitive search via GET /api/departments', async () => {
    const suffix = Date.now();
    const deptName = `PackingZone${suffix}`;
    const d1 = await IncidentService.createIncident({
      reporterName: 'Dept A',
      department: deptName,
      contactInfo: 'a@test.local',
      title: 'Dept search test 1',
      description: 'Test',
    });
    const d2 = await IncidentService.createIncident({
      reporterName: 'Dept B',
      department: deptName.toLowerCase(),
      contactInfo: 'b@test.local',
      title: 'Dept search test 2',
      description: 'Test',
    });
    const d3 = await IncidentService.createIncident({
      reporterName: 'Dept C',
      department: deptName,
      contactInfo: 'c@test.local',
      title: 'Dept search test 3',
      description: 'Test',
    });
    testIncidentIds.push(d1.id, d2.id, d3.id);

    const paRes = await departmentsGetHandler(
      new NextRequest(`http://localhost:3000/api/departments?q=PA`)
    );
    assert.equal(paRes.status, 200);
    const paList: string[] = await paRes.json();
    assert.ok(paList.includes(deptName), 'uppercase query PA should match canonical PackingZone');
    assert.equal(
      paList.filter((d) => d.toLowerCase() === deptName.toLowerCase()).length,
      1,
      'mixed-case duplicates must collapse to one canonical entry'
    );

    const pacRes = await departmentsGetHandler(
      new NextRequest(`http://localhost:3000/api/departments?q=pac`)
    );
    assert.equal(pacRes.status, 200);
    const pacList: string[] = await pacRes.json();
    assert.ok(pacList.includes(deptName), 'lowercase query pac should match canonical PackingZone');
  });

  it('requires department on POST /api/incidents user portal submission', async () => {
    const missingDeptRes = await incidentsPostHandler(
      new NextRequest('http://localhost:3000/api/incidents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reporterName: 'Portal User',
          department: '   ',
          contactInfo: 'ext 100',
          title: 'Missing dept test',
          description: 'Should fail validation',
        }),
      })
    );
    assert.equal(missingDeptRes.status, 400);

    const okRes = await incidentsPostHandler(
      new NextRequest('http://localhost:3000/api/incidents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reporterName: 'Portal User',
          department: 'Packing',
          contactInfo: 'ext 100',
          title: 'Valid dept test',
          description: 'Should succeed',
        }),
      })
    );
    assert.equal(okRes.status, 201);
    const created = await okRes.json();
    testIncidentIds.push(created.id);
    assert.equal(created.department, 'Packing');
  });

  it('allows PDF/Excel attachments and blocks dangerous extensions like .exe/.html/.svg', async () => {
    const adminToken = await createAdminSessionToken();
    const cookieHeader = `${ADMIN_COOKIE_NAME}=${adminToken}`;
    const inc = await IncidentService.createIncident({
      reporterName: 'File Tester',
      department: 'Packing',
      contactInfo: 'file@test.local',
      title: 'Multi-file attachment test',
      description: 'Verify PDF and Excel uploads + blocklist',
    });
    testIncidentIds.push(inc.id);

    const uploadFile = async (name: string, type: string, kind: 'REPORT' | 'RESOLUTION') => {
      const fd = new FormData();
      fd.append('file', new File([Buffer.from('TESTDATA')], name, { type }));
      fd.append('kind', kind);
      return attachmentsPostHandler(
        new NextRequest(`http://localhost:3000/api/incidents/${inc.ticketNo}/attachments`, {
          method: 'POST',
          headers: { cookie: cookieHeader },
          body: fd,
        }),
        { params: Promise.resolve({ id: inc.ticketNo }) }
      );
    };

    // Disallowed dangerous extensions must be rejected (400)
    for (const bad of [
      ['malware.exe', 'application/octet-stream'],
      ['xss.html', 'text/html'],
      ['vector.svg', 'image/svg+xml'],
    ]) {
      const badRes = await uploadFile(bad[0], bad[1], 'REPORT');
      assert.equal(badRes.status, 400, `Expected 400 for ${bad[0]}`);
    }

    // PDF and Excel (even with empty/octet-stream browser MIME) succeed (201)
    const pdfRes = await uploadFile('error-dump.pdf', 'application/pdf', 'REPORT');
    assert.equal(pdfRes.status, 201);
    const pdfAtt = await pdfRes.json();
    assert.equal(pdfAtt.fileType, 'application/pdf');

    const xlsxRes = await uploadFile('packing-list.xlsx', 'application/octet-stream', 'RESOLUTION');
    assert.equal(xlsxRes.status, 201);
    const xlsxAtt = await xlsxRes.json();
    assert.equal(xlsxAtt.fileType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Extension takes precedence over spoofed browser MIME
    assert.equal(isImageAttachment('report.pdf', 'image/png'), false);
    assert.equal(isPdfAttachment('photo.png', 'application/pdf'), false);

    // 0-byte attachment is rejected (400) on both attachments endpoint and portal POST
    const emptyAttFd = new FormData();
    emptyAttFd.append('file', new File([], 'empty.pdf', { type: 'application/pdf' }));
    emptyAttFd.append('kind', 'REPORT');
    const emptyAttRes = await attachmentsPostHandler(
      new NextRequest(`http://localhost:3000/api/incidents/${inc.ticketNo}/attachments`, {
        method: 'POST',
        headers: { cookie: cookieHeader },
        body: emptyAttFd,
      }),
      { params: Promise.resolve({ id: inc.ticketNo }) }
    );
    assert.equal(emptyAttRes.status, 400);

    const emptyPortalFd = new FormData();
    emptyPortalFd.append('reporterName', 'File Tester');
    emptyPortalFd.append('department', 'Packing');
    emptyPortalFd.append('contactInfo', 'file@test.local');
    emptyPortalFd.append('title', 'Empty attachment rejection test');
    emptyPortalFd.append('description', 'Should fail 400 on 0-byte named file');
    emptyPortalFd.append('attachment', new File([], 'empty.pdf', { type: 'application/pdf' }));
    const emptyPortalRes = await incidentsPostHandler(
      new NextRequest('http://localhost:3000/api/incidents', {
        method: 'POST',
        body: emptyPortalFd,
      })
    );
    assert.equal(emptyPortalRes.status, 400);

    // Malformed JSON payload on POST /api/incidents returns 400 instead of 500
    const badJsonRes = await incidentsPostHandler(
      new NextRequest('http://localhost:3000/api/incidents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{bad-json',
      })
    );
    assert.equal(badJsonRes.status, 400);

    // Clean up both uploaded files via DELETE endpoint
    for (const att of [pdfAtt, xlsxAtt]) {
      const delRes = await attachmentsDeleteHandler(
        new NextRequest(
          `http://localhost:3000/api/incidents/${inc.ticketNo}/attachments?attachmentId=${att.id}`,
          { method: 'DELETE', headers: { cookie: cookieHeader } }
        ),
        { params: Promise.resolve({ id: inc.ticketNo }) }
      );
      assert.equal(delRes.status, 200);
    }
  });

  it('validates IncidentServiceError and RootCauseService error handling', async () => {
    const err404 = new IncidentServiceError('missing', 404);
    assert.ok(err404 instanceof Error);
    assert.ok(err404 instanceof IncidentServiceError);
    assert.equal(err404.name, 'IncidentServiceError');
    assert.equal(err404.message, 'missing');
    assert.equal(err404.status, 404);

    const errDefault = new IncidentServiceError('bad request');
    assert.equal(errDefault.status, 400);

    await assert.rejects(
      () => RootCauseService.addRootCauseOption('   '),
      (err: unknown) => err instanceof IncidentServiceError && err.status === 400
    );

    const prevRow = await prisma.integrationConfig.findUnique({
      where: { key: 'root_cause_options' },
    });
    const tempOption = `TempRC-${Date.now()}`;
    try {
      const added = await RootCauseService.addRootCauseOption(tempOption);
      assert.ok(added.includes(tempOption));

      await assert.rejects(
        () => RootCauseService.addRootCauseOption(tempOption.toLowerCase()),
        (err: unknown) => err instanceof IncidentServiceError && err.status === 400
      );

      for (const opt of added) {
        if (opt !== tempOption) {
          await RootCauseService.deleteRootCauseOption(opt);
        }
      }

      await assert.rejects(
        () => RootCauseService.deleteRootCauseOption(tempOption),
        (err: unknown) => err instanceof IncidentServiceError && err.status === 400
      );
    } finally {
      if (prevRow) {
        await prisma.integrationConfig.upsert({
          where: { key: 'root_cause_options' },
          update: { value: prevRow.value, isEnabled: prevRow.isEnabled },
          create: { key: 'root_cause_options', value: prevRow.value, isEnabled: prevRow.isEnabled },
        });
      } else {
        await prisma.integrationConfig.deleteMany({
          where: { key: 'root_cause_options' },
        });
      }
    }
  });

  it('computes departments, MTTR exclusions, and analytics consistently via IncidentAnalyticsService', async () => {
    const [svcDepts, analyticsDepts] = await Promise.all([
      IncidentService.getDepartments(),
      IncidentAnalyticsService.getDepartments(),
    ]);
    assert.deepEqual(analyticsDepts, svcDepts);

    const [svcFiltered, analyticsFiltered] = await Promise.all([
      IncidentService.getDepartments('qa'),
      IncidentAnalyticsService.getDepartments('qa'),
    ]);
    assert.deepEqual(analyticsFiltered, svcFiltered);

    const today = new Date().toISOString().slice(0, 10);
    const [svcAnalytics, directAnalytics] = await Promise.all([
      IncidentService.getAnalyticsData({ startDate: today, endDate: today }),
      IncidentAnalyticsService.getAnalyticsData({ startDate: today, endDate: today }),
    ]);
    assert.deepEqual(directAnalytics, svcAnalytics);

    const grouped = IncidentAnalyticsService.groupDepartments(
      [{ department: '  it ' }, { department: 'IT' }, { department: null }],
      true
    );
    assert.deepEqual(grouped, [
      { department: 'IT', count: 2 },
      { department: 'General / Unspecified', count: 1 },
    ]);
  });
});
