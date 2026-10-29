import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import prisma from '../src/lib/prisma';
import { CategoryService } from '../src/lib/services/category.service';
import { IncidentService } from '../src/lib/services/incident.service';
import { IntegrationService } from '../src/lib/services/integration.service';
import { ADMIN_COOKIE_NAME, createAdminSessionToken } from '../src/lib/auth';
import { GET as exportCsvHandler } from '../src/app/api/incidents/export/route';
import { GET as inboundGetHandler, POST as inboundPostHandler } from '../src/app/api/incidents/inbound/route';

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
    assert.equal(analytics.byStatus.length, 4);
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
});
