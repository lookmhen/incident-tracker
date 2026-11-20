import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import prisma from '../src/lib/prisma';
import { SECRET_MASK } from '../src/lib/crypto';
import { ADMIN_COOKIE_NAME, createAdminSessionToken } from '../src/lib/auth';
import { McpService } from '../src/lib/services/mcp.service';
import { TeamsService } from '../src/lib/services/teams.service';
import { EmailService } from '../src/lib/services/email.service';
import { IntegrationService } from '../src/lib/services/integration.service';
import { GET as authAdminGet } from '../src/app/api/auth/admin/route';
import { GET as logsGet, PATCH as logsPatch } from '../src/app/api/integrations/logs/route';

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

describe('5. Webhook & Email Payload Builders (TeamsService & EmailService)', () => {
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

  it('builds Power Automate JSON payload matching expected schema', () => {
    const pa = TeamsService.buildPowerAutomatePayload(samplePayload);
    assert.equal(pa.ticketNo, 'INC-202610-777');
    assert.equal(pa.urgency, 'HIGH');
    assert.equal(pa.incident_type, 'Database');
    assert.ok(pa.detail.includes('[INC-202610-777] Database Connection Pool Exhausted'));
    assert.ok(pa.detail.includes('Somchai Jaidee'));
  });

  it('builds Microsoft Teams Adaptive Card v1.4 payload with urgency color coding', () => {
    const card = TeamsService.buildAdaptiveCard(samplePayload);
    assert.equal(card.type, 'message');
    const content = card.attachments[0].content;
    assert.equal(content.type, 'AdaptiveCard');
    assert.equal(content.version, '1.4');
    assert.equal((content.body[0] as any).items[0].color, 'Attention');
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
