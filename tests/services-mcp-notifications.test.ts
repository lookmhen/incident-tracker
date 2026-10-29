import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/lib/prisma';
import { SECRET_MASK } from '../src/lib/crypto';
import { McpService } from '../src/lib/services/mcp.service';
import { TeamsService } from '../src/lib/services/teams.service';
import { EmailService } from '../src/lib/services/email.service';
import { IntegrationService } from '../src/lib/services/integration.service';

describe('4. MCP Text Sanitization, Tag Extraction & Context Schema (src/lib/services/mcp.service.ts)', () => {
  it('strips HTML tags, Markdown links, and formatting symbols cleanly', () => {
    const dirty = '<b>Urgent:</b> Check [SAP Portal](https://example.com) `<script>alert(1)</script>` *now* #p1';
    const cleaned = McpService.cleanText(dirty);
    assert.equal(cleaned, 'Urgent: Check SAP Portal alert(1) now p1');
  });

  it('extracts domain-specific remediation tags and falls back to GENERAL_TRIAGE', () => {
    const sapTags = McpService.extractRemediationTags('SAP RFC COMMUNICATION_FAILURE on production');
    assert.ok(sapTags.includes('RFC_TIMEOUT'));
    assert.ok(sapTags.includes('SM59_DESTINATION'));

    const netTags = McpService.extractRemediationTags('Azure ExpressRoute BGP flap detected');
    assert.ok(netTags.includes('BGP_ROUTING'));

    const gwTags = McpService.extractRemediationTags('Webhook failed with 504 Gateway Timeout');
    assert.ok(gwTags.includes('HTTP_504'));

    const generalTags = McpService.extractRemediationTags('Mouse battery is low on 3rd floor');
    assert.deepEqual(generalTags, ['GENERAL_TRIAGE']);
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
    assert.ok(context.ai_remediation_tags.includes('HTTP_504'));
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
    assert.equal(content.body[0].items[0].color, 'Attention');
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
});

describe('6. IntegrationService Encryption at Rest, Masking & Audit Logs', () => {
  let backupSmtp: any;
  const createdLogIds: string[] = [];

  before(async () => {
    backupSmtp = (await IntegrationService.getRawConfig()).smtp;
  });

  after(async () => {
    await IntegrationService.saveSmtpConfig(backupSmtp);
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
});
