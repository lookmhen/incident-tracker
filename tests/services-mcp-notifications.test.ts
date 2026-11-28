import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import prisma from '../src/lib/prisma';
import { SECRET_MASK } from '../src/lib/crypto';
import { ADMIN_COOKIE_NAME, createAdminSessionToken } from '../src/lib/auth';
import { McpService } from '../src/lib/services/mcp.service';
import { WebhookService } from '../src/lib/services/webhook.service';
import { EmailService } from '../src/lib/services/email.service';
import { IntegrationService, IntegrationValidationError } from '../src/lib/services/integration.service';
import {
  buildWebhookPayload,
  DEFAULT_WEBHOOK_FIELDS,
  sanitizeStoredWebhookFields,
  validateWebhookFields,
} from '../src/lib/webhook-fields';
import { GET as authAdminGet } from '../src/app/api/auth/admin/route';
import { PUT as integrationsPut } from '../src/app/api/integrations/route';
import { GET as logsGet, PATCH as logsPatch, POST as logsPost } from '../src/app/api/integrations/logs/route';

describe('4. MCP Text Sanitization, Telemetry & Context Schema (src/lib/services/mcp.service.ts)', () => {
  it('strips HTML tags, Markdown links, and formatting symbols cleanly', () => {
    const dirty = '<b>Urgent:</b> Check [SAP Portal](https://example.com) `<script>alert(1)</script>` *now* #p1';
    const cleaned = McpService.cleanText(dirty);
    assert.equal(cleaned, 'Urgent: Check SAP Portal alert(1) now p1');
  });

  it('aggregates real category clusters directly from database', async () => {
    const recurring = await McpService.detectRecurringCases();
    assert.ok(Array.isArray(recurring));
    if (recurring.length > 0) {
      assert.ok(typeof recurring[0].pattern === 'string');
      assert.ok(typeof recurring[0].count === 'number');
    }
  });

  it('formats incident into standard MCP context schema with accurate severity mapping', () => {
    const now = new Date('2026-10-29T10:00:00.000Z');
    const context = McpService.formatMcpContext({
      ticketNo: 'INC-202610-999',
      title: '<b>API 504 Timeout</b>',
      description: 'Gateway timeout on checkout endpoint',
      resolution: 'Restarted ingress pod',
      category: 'Network / VPN',
      urgency: 'HIGH',
      status: 'RESOLVED',
      department: 'Platform Eng',
      createdAt: now,
      closedAt: now,
    });

    assert.equal(context.mcp_resource_uri, 'mcp://incidenthub/incidents/INC-202610-999');
    assert.equal(context.severity, 'P1_CRITICAL');
    assert.equal(context.vectors_ready, true);
    assert.ok(!context.clean_text_corpus.includes('<b>'));
    assert.equal(context.app_domain, 'Network / VPN');
  });
});

describe('5. Webhook & Email Payload Builders (WebhookService & EmailService)', () => {
  const samplePayload = {
    ticketNo: 'INC-202610-777',
    title: 'Database Connection Pool Exhausted',
    description: 'Primary DB rejecting new connections <script>evil()</script>',
    reporterName: 'Somchai Jaidee',
    department: 'Finance',
    contactInfo: 'somchai@company.com',
    urgency: 'HIGH',
    category: 'Database',
    attachmentUrl: '/uploads/1730000_error.png',
  };

  it('builds default outbound webhook JSON payload matching expected schema', () => {
    const pa = WebhookService.buildPowerAutomatePayload(samplePayload);
    assert.equal(pa.ticketNo, 'INC-202610-777');
    assert.equal(pa.urgency, 'HIGH');
    assert.equal(pa.incident_type, 'Database');
    assert.ok(pa.detail.includes('[INC-202610-777] Database Connection Pool Exhausted'));
    assert.ok(pa.detail.includes('Somchai Jaidee'));
  });

  it('builds custom outbound webhook JSON payload via WebhookService.buildWebhookPayload', () => {
    const custom = WebhookService.buildWebhookPayload(samplePayload, [
      { key: 'dept', source: 'department' },
      { key: 'summary', source: 'custom', template: '{{ticketNo}} - {{title}}' },
    ]);
    assert.deepEqual(custom, {
      dept: 'Finance',
      summary: 'INC-202610-777 - Database Connection Pool Exhausted',
    });
  });

  it('dispatches simulated webhook using configured customFields without Teams wording', async () => {
    const prevRow = await prisma.integrationConfig.findUnique({
      where: { key: 'teams' },
      select: { value: true, isEnabled: true },
    });
    const prevEnvUrl = process.env.TEAMS_WEBHOOK_URL;
    const prevWebhookUrl = process.env.WEBHOOK_URL;
    try {
      delete process.env.TEAMS_WEBHOOK_URL;
      delete process.env.WEBHOOK_URL;
      await IntegrationService.saveTeamsConfig({
        isEnabled: true,
        webhookUrl: '',
        customFields: [
          { key: 'incident_type', source: 'department' },
          { key: 'urgency', source: 'urgency' },
        ],
      });
      const res = await WebhookService.dispatch(samplePayload);
      assert.equal(res.success, true);
      assert.equal(res.simulated, true);
      assert.equal(/teams/i.test(res.message), false);

      const log = await prisma.notificationLog.findFirst({
        where: { ticketNo: samplePayload.ticketNo, channel: 'TEAMS' },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(log);
      assert.deepEqual(JSON.parse(log.payload || '{}'), {
        incident_type: 'Finance',
        urgency: 'HIGH',
      });
      await prisma.notificationLog.deleteMany({
        where: { ticketNo: samplePayload.ticketNo, channel: 'TEAMS' },
      });
    } finally {
      if (prevEnvUrl === undefined) delete process.env.TEAMS_WEBHOOK_URL;
      else process.env.TEAMS_WEBHOOK_URL = prevEnvUrl;
      if (prevWebhookUrl === undefined) delete process.env.WEBHOOK_URL;
      else process.env.WEBHOOK_URL = prevWebhookUrl;
      if (prevRow) {
        await prisma.integrationConfig.upsert({
          where: { key: 'teams' },
          update: { value: prevRow.value, isEnabled: prevRow.isEnabled },
          create: { key: 'teams', value: prevRow.value, isEnabled: prevRow.isEnabled },
        });
      } else {
        await prisma.integrationConfig.deleteMany({ where: { key: 'teams' } });
      }
    }
  });

  it('gracefully skips EmailService.dispatch when SMTP is disabled and logs FAILED when recipients are missing on forceSend', async () => {
    await IntegrationService.saveSmtpConfig({ isEnabled: false, recipientEmails: '' });

    // 1. Disabled -> skips cleanly without error
    const skipped = await EmailService.dispatch(samplePayload, false);
    assert.equal(skipped.success, false);
    assert.equal(skipped.statusCode, 200);

    // 2. forceSend with empty recipientEmails -> returns 400 and logs FAILED
    const failed = await EmailService.dispatch(samplePayload, true);
    assert.equal(failed.success, false);
    assert.equal(failed.statusCode, 400);

    // Clean up the test failure log
    await prisma.notificationLog.deleteMany({
      where: { ticketNo: samplePayload.ticketNo, channel: 'EMAIL' },
    });
  });

  it('omits Category section from EmailService.dispatch incident alert emails', async () => {
    const prevSmtpRow = await prisma.integrationConfig.findUnique({ where: { key: 'smtp' } });
    const origCreateTransporter = (EmailService as any).createTransporter;
    const sentEmails: Array<{ text?: string; html?: string }> = [];

    try {
      await IntegrationService.saveSmtpConfig({
        isEnabled: true,
        host: 'smtp.example.internal',
        port: 587,
        encryption: 'STARTTLS',
        recipientEmails: 'oncall@example.internal',
      });

      (EmailService as any).createTransporter = () => ({
        sendMail: async (mail: { text?: string; html?: string }) => {
          sentEmails.push(mail);
          return { messageId: `msg-${sentEmails.length}` };
        },
      });

      const alertRes = await EmailService.dispatch({
        ...samplePayload,
        ticketNo: 'TEST-EMAIL-CAT-1',
        category: null,
      });
      assert.equal(alertRes.success, true);
      assert.equal(sentEmails.length, 1);
      assert.equal(sentEmails[0].html?.includes('หมวดหมู่ (Category)'), false);
      assert.equal(sentEmails[0].html?.includes('General IT'), false);
      assert.equal(sentEmails[0].html?.includes('GeneralIT'), false);
      assert.equal(sentEmails[0].text?.includes('หมวดหมู่:'), false);
    } finally {
      (EmailService as any).createTransporter = origCreateTransporter;
      await prisma.notificationLog.deleteMany({
        where: { ticketNo: 'TEST-EMAIL-CAT-1', channel: 'EMAIL' },
      });
      if (prevSmtpRow) {
        await prisma.integrationConfig.upsert({
          where: { key: 'smtp' },
          update: { value: prevSmtpRow.value, isEnabled: prevSmtpRow.isEnabled },
          create: { key: 'smtp', value: prevSmtpRow.value, isEnabled: prevSmtpRow.isEnabled },
        });
      } else {
        await prisma.integrationConfig.deleteMany({ where: { key: 'smtp' } });
      }
    }
  });

  it('resolves portalBaseUrl from request headers and APP_URL env safely', () => {
    const prevAppUrl = process.env.APP_URL;
    try {
      delete process.env.APP_URL;
      const fromHost = EmailService.resolvePortalUrl({
        headers: new Headers({ host: '192.168.1.156:3001' }),
        url: 'http://localhost:3000/api/incidents',
      });
      assert.equal(fromHost, 'http://192.168.1.156:3001');

      const fromProxy = EmailService.resolvePortalUrl({
        headers: new Headers({ 'x-forwarded-host': 'portal.company.com', 'x-forwarded-proto': 'https' }),
        url: 'http://0.0.0.0:3000/api/incidents',
      });
      assert.equal(fromProxy, 'https://portal.company.com');

      const bindZero = EmailService.resolvePortalUrl({
        headers: new Headers({ host: '0.0.0.0:3000' }),
      });
      assert.equal(bindZero, undefined);

      process.env.APP_URL = 'https://incidents.internal/';
      assert.equal(
        EmailService.resolvePortalUrl({ headers: new Headers({ host: '192.168.1.156:3001' }) }),
        'https://incidents.internal'
      );
    } finally {
      if (prevAppUrl === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = prevAppUrl;
    }
  });
});

describe('6. IntegrationService Encryption at Rest, Masking & Audit Logs', () => {
  let backupSmtp: any;
  let backupAckRow: { value: string } | null = null;
  const createdLogIds: string[] = [];

  before(async () => {
    backupSmtp = (await IntegrationService.getRawConfig()).smtp;
    backupAckRow = await prisma.integrationConfig.findUnique({
      where: { key: 'logs_acknowledged_at' },
      select: { value: true },
    });
  });

  after(async () => {
    await IntegrationService.saveSmtpConfig(backupSmtp);
    if (backupAckRow) {
      await prisma.integrationConfig.upsert({
        where: { key: 'logs_acknowledged_at' },
        update: { value: backupAckRow.value },
        create: { key: 'logs_acknowledged_at', value: backupAckRow.value },
      });
    } else {
      await prisma.integrationConfig.deleteMany({ where: { key: 'logs_acknowledged_at' } });
    }
    if (createdLogIds.length > 0) {
      await prisma.notificationLog.deleteMany({
        where: { id: { in: createdLogIds } },
      });
    }
  });

  it('encrypts SMTP password in SQLite and preserves password when saving SECRET_MASK', async () => {
    const maskedAfterSave = await IntegrationService.saveSmtpConfig({
      isEnabled: false,
      host: 'smtp.internal.local',
      port: 587,
      username: 'alerts@internal.local',
      password: 'MySecretSmtpPassword99!',
      recipientEmails: 'it@internal.local',
    });

    assert.equal(maskedAfterSave.smtp.password, SECRET_MASK);
    assert.equal(maskedAfterSave.hasSmtpPassword, true);

    // Check raw SQLite row is encrypted with enc:v1:
    const dbRow = await prisma.integrationConfig.findUnique({ where: { key: 'smtp' } });
    assert.ok(dbRow);
    const parsedDb = JSON.parse(dbRow.value);
    assert.ok(parsedDb.password.startsWith('enc:v1:'), 'Password in SQLite must be AES-256-GCM encrypted');

    // Saving again with SECRET_MASK ('••••••••') must keep the original password intact
    await IntegrationService.saveSmtpConfig({
      host: 'smtp2.internal.local',
      password: SECRET_MASK,
    });

    const rawConfig = await IntegrationService.getRawConfig();
    assert.equal(rawConfig.smtp.host, 'smtp2.internal.local');
    assert.equal(rawConfig.smtp.password, 'MySecretSmtpPassword99!');
  });

  it('records and filters NotificationLog entries for audit trail', async () => {
    const log = await IntegrationService.logNotification({
      channel: 'TEAMS',
      ticketNo: 'INC-TEST-001',
      destination: 'https://example.com/webhook',
      status: 'SUCCESS',
      statusCode: 200,
      payload: JSON.stringify({ test: true }),
      response: 'OK',
    });
    assert.ok(log);
    createdLogIds.push(log.id);

    const logs = await IntegrationService.getLogs({ channel: 'TEAMS', status: 'SUCCESS', limit: 10 });
    assert.ok(logs.some((l) => l.id === log.id));
  });

  it('tracks unresolved TEAMS/EMAIL failures, auto-clears on retry success, and resets to 0 on acknowledge', async () => {
    const adminCookie = `${ADMIN_COOKIE_NAME}=${await createAdminSessionToken()}`;
    const authedReq = (url: string, method = 'GET') =>
      new NextRequest(url, { method, headers: { cookie: adminCookie } });

    const ackRes = await logsPatch(authedReq('http://localhost/api/integrations/logs', 'PATCH'));
    assert.equal(ackRes.status, 200);
    assert.equal(await IntegrationService.getUnresolvedFailedCount(), 0);

    await new Promise((r) => setTimeout(r, 20));
    const failTeams = await IntegrationService.logNotification({
      channel: 'TEAMS',
      ticketNo: 'INC-TEST-FAIL-1',
      destination: 'https://example.com/hook',
      status: 'FAILED',
      statusCode: 500,
      payload: '{}',
      response: 'Webhook timeout',
    });
    const failEmail = await IntegrationService.logNotification({
      channel: 'EMAIL',
      ticketNo: 'INC-TEST-FAIL-2',
      destination: 'ops@example.com',
      status: 'FAILED',
      payload: '{}',
      response: 'SMTP rejected',
    });
    const failCustom = await IntegrationService.logNotification({
      channel: 'CUSTOM_API',
      ticketNo: 'INC-TEST-FAIL-3',
      destination: 'https://example.com/api',
      status: 'FAILED',
      statusCode: 502,
      payload: '{}',
      response: 'Bad gateway',
    });
    assert.ok(failTeams && failEmail && failCustom);
    createdLogIds.push(failTeams.id, failEmail.id, failCustom.id);

    assert.equal(await IntegrationService.getUnresolvedFailedCount(), 2);

    const adminAuthData = await (await authAdminGet(authedReq('http://localhost/api/auth/admin'))).json();
    assert.equal(adminAuthData.authenticated, true);
    assert.equal(adminAuthData.failedNotifications, 2);

    await new Promise((r) => setTimeout(r, 20));
    const retrySuccess = await IntegrationService.logNotification({
      channel: 'TEAMS',
      ticketNo: 'INC-TEST-FAIL-1',
      destination: 'https://example.com/hook',
      status: 'SUCCESS',
      statusCode: 200,
      payload: '{}',
      response: 'OK',
    });
    assert.ok(retrySuccess);
    createdLogIds.push(retrySuccess.id);

    const logsRes = await (await logsGet(authedReq('http://localhost/api/integrations/logs?limit=5'))).json();
    assert.equal(logsRes.unresolvedFailedCount, 1);

    await new Promise((r) => setTimeout(r, 20));
    const clearRes = await (await logsPatch(authedReq('http://localhost/api/integrations/logs', 'PATCH'))).json();
    assert.equal(clearRes.unresolvedFailedCount, 0);

    const clearedAuthData = await (await authAdminGet(authedReq('http://localhost/api/auth/admin'))).json();
    assert.equal(clearedAuthData.failedNotifications, 0);

    await new Promise((r) => setTimeout(r, 20));
    const postAckFail = await IntegrationService.logNotification({
      channel: 'EMAIL',
      ticketNo: 'INC-TEST-FAIL-4',
      destination: 'ops@example.com',
      status: 'FAILED',
      payload: '{}',
      response: 'SMTP error',
    });
    assert.ok(postAckFail);
    createdLogIds.push(postAckFail.id);
    assert.equal(await IntegrationService.getUnresolvedFailedCount(), 1);
  });

  it('auto-prunes notification logs older than 14 days on write', async () => {
    const expiredDate = new Date(Date.now() - (IntegrationService.LOG_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
    const staleLog = await prisma.notificationLog.create({
      data: {
        channel: 'EMAIL',
        ticketNo: 'INC-TEST-STALE',
        destination: 'stale@example.com',
        status: 'SUCCESS',
        createdAt: expiredDate,
      },
    });
    createdLogIds.push(staleLog.id);

    const freshLog = await IntegrationService.logNotification({
      channel: 'EMAIL',
      ticketNo: 'INC-TEST-FRESH',
      destination: 'fresh@example.com',
      status: 'SUCCESS',
    });
    assert.ok(freshLog);
    createdLogIds.push(freshLog.id);

    const remainingStale = await prisma.notificationLog.findUnique({ where: { id: staleLog.id } });
    const remainingFresh = await prisma.notificationLog.findUnique({ where: { id: freshLog.id } });
    assert.equal(remainingStale, null, 'logs older than 14 days must be pruned');
    assert.ok(remainingFresh, 'fresh logs within 14 days must be kept');
  });
});

describe('7. Outbound Webhook Field Mapping & Payload Builder (src/lib/webhook-fields.ts)', () => {
  const sampleInput = {
    ticketNo: 'INC-202611-010',
    title: 'Printer offline',
    description: 'Warehouse zebra printer jammed',
    reporterName: 'Niran',
    department: 'Packing',
    contactInfo: 'Ext. 412',
    urgency: 'MEDIUM',
    category: null,
  };

  it('builds default 10-field flat payload preserving legacy defaults', () => {
    const out = buildWebhookPayload(sampleInput, DEFAULT_WEBHOOK_FIELDS);
    assert.equal(out.ticketNo, 'INC-202611-010');
    assert.equal(out.urgency, 'MEDIUM');
    assert.equal(out.department, 'Packing');
    assert.equal(out.category, 'General IT');
    assert.equal(out.incident_type, 'General IT');
    assert.ok(out.detail.includes('[INC-202611-010] Printer offline'));
    assert.ok(out.detail.includes('แผนก: Packing'));
  });

  it('maps custom keys, {{var}} templates, {{detail}}, and null/unknown tokens safely', () => {
    const out = buildWebhookPayload(
      { ...sampleInput, department: null, urgency: undefined as any },
      [
        { key: 'incident_type', source: 'department' },
        { key: 'summary', source: 'custom', template: '{{ticketNo}}: {{reporterName}} ({{department}}) - {{missing}}' },
        { key: 'full_detail', source: 'custom', template: '{{detail}}' },
      ]
    );
    assert.equal(out.incident_type, '');
    assert.equal(out.summary, 'INC-202611-010: Niran () - ');
    assert.ok(out.full_detail.includes('แผนก: -'));
    assert.equal(Object.keys(out).length, 3);
  });

  it('validates custom fields and rejects empty arrays, blank/duplicate keys, invalid sources, and prototype keys', () => {
    assert.equal(validateWebhookFields([]).valid, false);
    assert.equal(validateWebhookFields([{ key: '   ', source: 'title' }]).valid, false);
    assert.equal(
      validateWebhookFields([
        { key: 'dept', source: 'department' },
        { key: ' dept ', source: 'title' },
      ]).valid,
      false
    );
    assert.equal(validateWebhookFields([{ key: 'x', source: 'unknown_src' }]).valid, false);
    assert.equal(validateWebhookFields([{ key: '__proto__', source: 'title' }]).valid, false);
    assert.equal(validateWebhookFields([{ key: 'constructor', source: 'title' }]).valid, false);
    assert.equal(validateWebhookFields([{ key: 'prototype', source: 'title' }]).valid, false);

    const ok = validateWebhookFields([
      { key: ' dept ', source: 'department', template: 'ignored-when-not-custom' },
      { key: 'msg', source: 'custom', template: '{{title}}' },
    ]);
    assert.equal(ok.valid, true);
    if (ok.valid) {
      assert.deepEqual(ok.fields, [
        { key: 'dept', source: 'department' },
        { key: 'msg', source: 'custom', template: '{{title}}' },
      ]);
    }
  });

  it('falls back to DEFAULT_WEBHOOK_FIELDS when stored fields are missing or invalid', () => {
    assert.deepEqual(sanitizeStoredWebhookFields(undefined), DEFAULT_WEBHOOK_FIELDS);
    assert.deepEqual(sanitizeStoredWebhookFields([]), DEFAULT_WEBHOOK_FIELDS);
    assert.deepEqual(sanitizeStoredWebhookFields([{ key: '__proto__', source: 'title' }]), DEFAULT_WEBHOOK_FIELDS);
  });
});

describe('8. IntegrationService Custom Webhook Fields & API Validation', () => {
  let backupTeamsRow: { value: string; isEnabled: boolean } | null = null;

  before(async () => {
    backupTeamsRow = await prisma.integrationConfig.findUnique({
      where: { key: 'teams' },
      select: { value: true, isEnabled: true },
    });
  });

  after(async () => {
    if (backupTeamsRow) {
      await prisma.integrationConfig.upsert({
        where: { key: 'teams' },
        update: { value: backupTeamsRow.value, isEnabled: backupTeamsRow.isEnabled },
        create: { key: 'teams', value: backupTeamsRow.value, isEnabled: backupTeamsRow.isEnabled },
      });
    } else {
      await prisma.integrationConfig.deleteMany({ where: { key: 'teams' } });
    }
  });

  it('falls back to DEFAULT_WEBHOOK_FIELDS on legacy adaptive_card DB row and preserves customFields on partial updates', async () => {
    await prisma.integrationConfig.upsert({
      where: { key: 'teams' },
      update: {
        value: JSON.stringify({ webhookUrl: '', payloadMode: 'adaptive_card' }),
        isEnabled: true,
      },
      create: {
        key: 'teams',
        value: JSON.stringify({ webhookUrl: '', payloadMode: 'adaptive_card' }),
        isEnabled: true,
      },
    });

    const legacy = await IntegrationService.getRawConfig();
    assert.deepEqual(legacy.teams.customFields, DEFAULT_WEBHOOK_FIELDS);
    assert.equal('payloadMode' in legacy.teams, false);

    const custom = [
      { key: 'incident_type', source: 'department' as const },
      { key: 'detail', source: 'detail' as const },
    ];
    await IntegrationService.saveTeamsConfig({ customFields: custom });
    await IntegrationService.saveTeamsConfig({ isEnabled: false });

    const afterPartial = await IntegrationService.getRawConfig();
    assert.equal(afterPartial.teams.isEnabled, false);
    assert.deepEqual(afterPartial.teams.customFields, custom);
  });

  it('rejects invalid or duplicate customFields with IntegrationValidationError (400) and HTTP 400 on PUT /api/integrations', async () => {
    await assert.rejects(
      () =>
        IntegrationService.saveTeamsConfig({
          customFields: [
            { key: 'dept', source: 'department' },
            { key: 'dept', source: 'title' },
          ],
        }),
      (err: unknown) => err instanceof IntegrationValidationError && err.status === 400
    );

    const adminCookie = `${ADMIN_COOKIE_NAME}=${await createAdminSessionToken()}`;
    const resEmpty = await integrationsPut(
      new NextRequest('http://localhost/api/integrations', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify({ section: 'teams', data: { customFields: [] } }),
      })
    );
    assert.equal(resEmpty.status, 400);
    const bodyEmpty = await resEmpty.json();
    assert.ok(typeof bodyEmpty.error === 'string' && bodyEmpty.error.length > 0);

    const resProto = await integrationsPut(
      new NextRequest('http://localhost/api/integrations', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie: adminCookie },
        body: JSON.stringify({
          section: 'teams',
          data: { customFields: [{ key: '__proto__', source: 'title' }] },
        }),
      })
    );
    assert.equal(resProto.status, 400);
  });

  it('validates webhookUrl protocol, supports WEBHOOK_URL env, and allows disabled webhook with empty URL', async () => {
    const prevEnvUrl = process.env.TEAMS_WEBHOOK_URL;
    const prevWebhookUrl = process.env.WEBHOOK_URL;
    try {
      delete process.env.TEAMS_WEBHOOK_URL;
      delete process.env.WEBHOOK_URL;
      await assert.rejects(
        () => IntegrationService.saveTeamsConfig({ webhookUrl: 'ftp://bad.local/hook' }),
        (err: unknown) => err instanceof IntegrationValidationError && err.status === 400
      );

      const saved = await IntegrationService.saveTeamsConfig({
        isEnabled: false,
        webhookUrl: '',
        customFields: [{ key: 'dept', source: 'department' }],
      });
      assert.equal(saved.teams.isEnabled, false);
      assert.equal(saved.teams.webhookUrl, '');
      assert.deepEqual(saved.teams.customFields, [{ key: 'dept', source: 'department' }]);

      process.env.WEBHOOK_URL = 'https://webhook.example.local/hook';
      const withEnv = await IntegrationService.getRawConfig();
      assert.equal(withEnv.teams.webhookUrl, 'https://webhook.example.local/hook');
    } finally {
      if (prevEnvUrl === undefined) delete process.env.TEAMS_WEBHOOK_URL;
      else process.env.TEAMS_WEBHOOK_URL = prevEnvUrl;
      if (prevWebhookUrl === undefined) delete process.env.WEBHOOK_URL;
      else process.env.WEBHOOK_URL = prevWebhookUrl;
    }
  });

  it('replays stored log.payload verbatim on POST /api/integrations/logs when incident is absent', async () => {
    const prevEnvUrl = process.env.TEAMS_WEBHOOK_URL;
    const prevWebhookUrl = process.env.WEBHOOK_URL;
    const createdIds: string[] = [];
    try {
      delete process.env.TEAMS_WEBHOOK_URL;
      delete process.env.WEBHOOK_URL;
      await IntegrationService.saveTeamsConfig({
        isEnabled: false,
        webhookUrl: '',
        customFields: [{ key: 'detail', source: 'detail' }],
      });

      const originalPayload = { dept: 'Packing', customKey: 'ping-only' };
      const seededLog = await IntegrationService.logNotification({
        channel: 'CUSTOM_API',
        ticketNo: 'MISSING-TICKET-999',
        destination: 'https://example.invalid/custom-hook',
        status: 'FAILED',
        statusCode: 500,
        payload: JSON.stringify(originalPayload),
        errorMessage: 'Network error',
      });
      assert.ok(seededLog);
      createdIds.push(seededLog.id);

      const adminCookie = `${ADMIN_COOKIE_NAME}=${await createAdminSessionToken()}`;
      const res = await logsPost(
        new NextRequest('http://localhost/api/integrations/logs', {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: adminCookie },
          body: JSON.stringify({ logId: seededLog.id }),
        })
      );
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.simulated, true);

      const replayedLog = await prisma.notificationLog.findFirst({
        where: { ticketNo: 'MISSING-TICKET-999', status: 'SUCCESS' },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(replayedLog);
      createdIds.push(replayedLog.id);
      assert.equal(replayedLog.channel, 'CUSTOM_API');
      assert.deepEqual(JSON.parse(replayedLog.payload || '{}'), originalPayload);
    } finally {
      if (prevEnvUrl === undefined) delete process.env.TEAMS_WEBHOOK_URL;
      else process.env.TEAMS_WEBHOOK_URL = prevEnvUrl;
      if (prevWebhookUrl === undefined) delete process.env.WEBHOOK_URL;
      else process.env.WEBHOOK_URL = prevWebhookUrl;
      if (createdIds.length > 0) {
        await prisma.notificationLog.deleteMany({ where: { id: { in: createdIds } } });
      }
    }
  });
});
