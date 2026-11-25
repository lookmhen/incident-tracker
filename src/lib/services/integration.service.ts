import { prisma } from '@/lib/prisma';
import { constantTimeEqual } from '@/lib/auth';
import { encryptSecret, decryptSecret, maskSecret, generateApiKey, SECRET_MASK } from '@/lib/crypto';
import {
  DEFAULT_WEBHOOK_FIELDS,
  sanitizeStoredWebhookFields,
  validateWebhookFields,
  type WebhookFieldMapping,
} from '@/lib/webhook-fields';

export class IntegrationValidationError extends Error {
  public readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationValidationError';
  }
}

export interface TeamsIntegrationSettings {
  isEnabled: boolean;
  webhookUrl: string;
  customFields: WebhookFieldMapping[];
}

export interface SmtpIntegrationSettings {
  isEnabled: boolean;
  host: string;
  port: number;
  encryption: 'STARTTLS' | 'SSL' | 'NONE';
  username: string;
  password: string;
  senderEmail: string;
  recipientEmails: string; // comma-separated
}

export interface McpSecuritySettings {
  mcpEnabled: boolean;
  enforceApiKey: boolean;
  apiKey: string;
}

export interface AllIntegrationsConfig {
  teams: TeamsIntegrationSettings;
  smtp: SmtpIntegrationSettings;
  mcpSecurity: McpSecuritySettings;
}

const DEFAULT_TEAMS_URL = process.env.TEAMS_WEBHOOK_URL || '';

export class IntegrationService {
  public static isPlaceholderWebhookUrl(url?: string | null): boolean {
    const u = (url || '').trim().toLowerCase();
    return !u || u.includes('your-webhook-url') || u.includes('your-power-automate-or-teams-webhook-url');
  }

  public static getEnvWebhookUrl(): string {
    return (process.env.WEBHOOK_URL || process.env.TEAMS_WEBHOOK_URL || '').trim();
  }

  /**
   * Retrieves raw (decrypted) configuration for internal server services
   */
  public static async getRawConfig(): Promise<AllIntegrationsConfig> {
    const records = await prisma.integrationConfig.findMany();
    const map = new Map<string, { value: string; isEnabled: boolean }>();
    for (const r of records) {
      map.set(r.key, { value: r.value, isEnabled: r.isEnabled });
    }

    // 1. Outbound Webhook Config (stored under 'teams' key for backwards compatibility)
    const envWebhookUrl = this.getEnvWebhookUrl();
    const isEnvConfigured = Boolean(
      envWebhookUrl && !this.isPlaceholderWebhookUrl(envWebhookUrl) && envWebhookUrl.startsWith('http')
    );

    let teams: TeamsIntegrationSettings = {
      isEnabled: true,
      webhookUrl: isEnvConfigured ? envWebhookUrl : '',
      customFields: DEFAULT_WEBHOOK_FIELDS.map((f) => ({ ...f })),
    };
    const teamsRecord = map.get('teams');
    if (teamsRecord) {
      try {
        const parsed = JSON.parse(teamsRecord.value);
        const decryptedUrl = parsed.webhookUrl ? decryptSecret(parsed.webhookUrl).trim() : '';
        const effectiveUrl =
          decryptedUrl && !this.isPlaceholderWebhookUrl(decryptedUrl)
            ? decryptedUrl
            : isEnvConfigured
              ? envWebhookUrl
              : decryptedUrl;

        teams = {
          isEnabled: teamsRecord.isEnabled,
          webhookUrl: effectiveUrl,
          customFields: sanitizeStoredWebhookFields(parsed.customFields),
        };
      } catch {}
    }

    // 2. SMTP Config
    let smtp: SmtpIntegrationSettings = {
      isEnabled: false,
      host: 'smtp.office365.com',
      port: 587,
      encryption: 'STARTTLS',
      username: '',
      password: '',
      senderEmail: '',
      recipientEmails: '',
    };
    const smtpRecord = map.get('smtp');
    if (smtpRecord) {
      try {
        const parsed = JSON.parse(smtpRecord.value);
        smtp = {
          isEnabled: smtpRecord.isEnabled,
          host: parsed.host || 'smtp.office365.com',
          port: Number(parsed.port) || 587,
          encryption: parsed.encryption || 'STARTTLS',
          username: parsed.username || '',
          password: parsed.password ? decryptSecret(parsed.password) : '',
          senderEmail: parsed.senderEmail || parsed.username || '',
          recipientEmails: parsed.recipientEmails || '',
        };
      } catch {}
    }

    // 3. MCP & API Security Config
    let mcpSecurity: McpSecuritySettings = {
      mcpEnabled: true,
      enforceApiKey: false,
      apiKey: '',
    };
    const mcpRecord = map.get('mcp_security');
    if (mcpRecord) {
      try {
        const parsed = JSON.parse(mcpRecord.value);
        mcpSecurity = {
          mcpEnabled: mcpRecord.isEnabled,
          enforceApiKey: Boolean(parsed.enforceApiKey),
          apiKey: parsed.apiKey ? decryptSecret(parsed.apiKey) : '',
        };
      } catch {}
    }

    // Auto-initialize API key if empty
    if (!mcpSecurity.apiKey) {
      const newKey = generateApiKey();
      mcpSecurity.apiKey = newKey;
      await prisma.integrationConfig.upsert({
        where: { key: 'mcp_security' },
        update: {
          value: JSON.stringify({
            enforceApiKey: mcpSecurity.enforceApiKey,
            apiKey: encryptSecret(newKey),
          }),
          isEnabled: mcpSecurity.mcpEnabled,
        },
        create: {
          key: 'mcp_security',
          value: JSON.stringify({
            enforceApiKey: mcpSecurity.enforceApiKey,
            apiKey: encryptSecret(newKey),
          }),
          isEnabled: mcpSecurity.mcpEnabled,
        },
      });
    }

    return { teams, smtp, mcpSecurity };
  }

  /**
   * Retrieves masked configuration safe for returning to the browser UI
   */
  public static async getMaskedConfig(): Promise<AllIntegrationsConfig & { hasSmtpPassword: boolean }> {
    const raw = await this.getRawConfig();
    return {
      teams: {
        ...raw.teams,
      },
      smtp: {
        ...raw.smtp,
        password: raw.smtp.password ? maskSecret(raw.smtp.password) : '',
      },
      mcpSecurity: {
        ...raw.mcpSecurity,
      },
      hasSmtpPassword: Boolean(raw.smtp.password),
    };
  }

  /**
   * Updates outbound webhook configuration (encrypts Webhook URL at rest)
   */
  public static async saveTeamsConfig(input: Partial<TeamsIntegrationSettings>) {
    const current = (await this.getRawConfig()).teams;
    const isEnabled = input.isEnabled !== undefined ? Boolean(input.isEnabled) : current.isEnabled;
    const webhookUrl = input.webhookUrl !== undefined ? input.webhookUrl.trim() : current.webhookUrl;

    if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
      throw new IntegrationValidationError('Webhook URL must start with http:// or https://');
    }

    let customFields = current.customFields;
    if (input.customFields !== undefined) {
      const checked = validateWebhookFields(input.customFields);
      if (!checked.valid) {
        throw new IntegrationValidationError(checked.error);
      }
      customFields = checked.fields;
    }

    const valueJson = JSON.stringify({
      webhookUrl: encryptSecret(webhookUrl),
      customFields,
    });

    await prisma.integrationConfig.upsert({
      where: { key: 'teams' },
      update: { value: valueJson, isEnabled },
      create: { key: 'teams', value: valueJson, isEnabled },
    });

    return this.getMaskedConfig();
  }

  /**
   * Updates SMTP configuration (encrypts password with AES-256-GCM at rest)
   */
  public static async saveSmtpConfig(input: Partial<SmtpIntegrationSettings>) {
    const current = (await this.getRawConfig()).smtp;
    const isEnabled = input.isEnabled !== undefined ? Boolean(input.isEnabled) : current.isEnabled;

    // Preserve existing encrypted password if user sent '••••••••' or empty
    let plainPassword = current.password;
    if (input.password !== undefined && input.password !== SECRET_MASK) {
      plainPassword = input.password;
    }

    const updated: SmtpIntegrationSettings = {
      isEnabled,
      host: input.host !== undefined ? input.host.trim() : current.host,
      port: input.port !== undefined ? Number(input.port) : current.port,
      encryption: input.encryption || current.encryption,
      username: input.username !== undefined ? input.username.trim() : current.username,
      password: plainPassword,
      senderEmail: input.senderEmail !== undefined ? input.senderEmail.trim() : current.senderEmail,
      recipientEmails: input.recipientEmails !== undefined ? input.recipientEmails.trim() : current.recipientEmails,
    };

    const valueJson = JSON.stringify({
      host: updated.host,
      port: updated.port,
      encryption: updated.encryption,
      username: updated.username,
      password: encryptSecret(updated.password),
      senderEmail: updated.senderEmail,
      recipientEmails: updated.recipientEmails,
    });

    await prisma.integrationConfig.upsert({
      where: { key: 'smtp' },
      update: { value: valueJson, isEnabled },
      create: { key: 'smtp', value: valueJson, isEnabled },
    });

    return this.getMaskedConfig();
  }

  /**
   * Updates MCP & API Security settings
   */
  public static async saveMcpSecurityConfig(input: { mcpEnabled?: boolean; enforceApiKey?: boolean }) {
    const current = (await this.getRawConfig()).mcpSecurity;
    const mcpEnabled = input.mcpEnabled !== undefined ? Boolean(input.mcpEnabled) : current.mcpEnabled;
    const enforceApiKey = input.enforceApiKey !== undefined ? Boolean(input.enforceApiKey) : current.enforceApiKey;

    const valueJson = JSON.stringify({
      enforceApiKey,
      apiKey: encryptSecret(current.apiKey),
    });

    await prisma.integrationConfig.upsert({
      where: { key: 'mcp_security' },
      update: { value: valueJson, isEnabled: mcpEnabled },
      create: { key: 'mcp_security', value: valueJson, isEnabled: mcpEnabled },
    });

    return this.getMaskedConfig();
  }

  /**
   * Generates & rotates a new API key
   */
  public static async rotateApiKey(): Promise<string> {
    const current = (await this.getRawConfig()).mcpSecurity;
    const newKey = generateApiKey();

    const valueJson = JSON.stringify({
      enforceApiKey: current.enforceApiKey,
      apiKey: encryptSecret(newKey),
    });

    await prisma.integrationConfig.upsert({
      where: { key: 'mcp_security' },
      update: { value: valueJson, isEnabled: current.mcpEnabled },
      create: { key: 'mcp_security', value: valueJson, isEnabled: current.mcpEnabled },
    });

    return newKey;
  }

  /**
   * Validates an incoming API key when enforceApiKey is enabled
   */
  public static async verifyApiKey(providedKey: string | null): Promise<{ allowed: boolean; reason?: string }> {
    const { mcpSecurity } = await this.getRawConfig();
    if (!mcpSecurity.enforceApiKey) {
      return { allowed: true };
    }
    if (!providedKey) {
      return { allowed: false, reason: 'Missing API Key. Provide x-api-key header or Authorization: Bearer <key>.' };
    }
    if (!constantTimeEqual(providedKey, mcpSecurity.apiKey)) {
      return { allowed: false, reason: 'Invalid API Key.' };
    }
    return { allowed: true };
  }

  public static readonly LOG_RETENTION_DAYS = 14;

  /**
   * Logs a notification delivery attempt and prunes logs older than LOG_RETENTION_DAYS
   */
  public static async logNotification(entry: {
    ticketNo?: string | null;
    channel: 'TEAMS' | 'EMAIL' | 'CUSTOM_API';
    destination: string;
    status: 'SUCCESS' | 'FAILED';
    statusCode?: number | null;
    payload?: string | null;
    response?: string | null;
    errorMessage?: string | null;
  }) {
    try {
      const created = await prisma.notificationLog.create({
        data: {
          ticketNo: entry.ticketNo || null,
          channel: entry.channel,
          destination: entry.destination,
          status: entry.status,
          statusCode: entry.statusCode ?? null,
          payload: entry.payload ?? null,
          response: entry.response ?? null,
          errorMessage: entry.errorMessage ?? null,
        },
      });
      // Keep NotificationLog table small without external cron jobs
      const cutoff = new Date(Date.now() - this.LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      await prisma.notificationLog
        .deleteMany({ where: { createdAt: { lt: cutoff } } })
        .catch((pruneErr) => console.error('[IntegrationService] Failed to prune old logs:', pruneErr));
      return created;
    } catch (e) {
      console.error('[IntegrationService] Failed to write notification log:', e);
      return null;
    }
  }

  /**
   * Fetches paginated notification delivery logs
   */
  public static async getLogs(params?: { channel?: string; status?: string; limit?: number }) {
    const where: any = {};
    if (params?.channel && params.channel !== 'ALL') {
      where.channel = params.channel;
    }
    if (params?.status && params.status !== 'ALL') {
      where.status = params.status;
    }

    const logs = await prisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params?.limit || 50,
    });

    return logs;
  }

  private static readonly LOGS_ACK_KEY = 'logs_acknowledged_at';

  /**
   * Counts unresolved FAILED TEAMS/EMAIL deliveries (cleared by subsequent SUCCESS for same ticket+channel or manual acknowledge)
   */
  public static async getUnresolvedFailedCount(): Promise<number> {
    const ackRow = await prisma.integrationConfig.findUnique({
      where: { key: this.LOGS_ACK_KEY },
    });
    const ackDate = ackRow?.value ? new Date(ackRow.value) : null;
    const validAck = ackDate && !Number.isNaN(ackDate.getTime()) ? ackDate : null;

    const logs = await prisma.notificationLog.findMany({
      where: {
        channel: { in: ['TEAMS', 'EMAIL'] },
        ...(validAck ? { createdAt: { gt: validAck } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, ticketNo: true, channel: true, status: true },
    });

    const unresolved = new Set<string>();
    for (const log of logs) {
      const key = log.ticketNo ? `${log.channel}:${log.ticketNo}` : `id:${log.id}`;
      if (log.status === 'FAILED') unresolved.add(key);
      else if (log.status === 'SUCCESS') unresolved.delete(key);
    }
    return unresolved.size;
  }

  /**
   * Marks all current failed notification alerts as acknowledged so badge resets to 0
   */
  public static async acknowledgeFailedLogs(): Promise<void> {
    await prisma.integrationConfig.upsert({
      where: { key: this.LOGS_ACK_KEY },
      update: { value: new Date().toISOString(), isEnabled: true },
      create: { key: this.LOGS_ACK_KEY, value: new Date().toISOString(), isEnabled: true },
    });
  }
}
