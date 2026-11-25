import { IntegrationService } from '@/lib/services/integration.service';
import { buildWebhookPayload, type WebhookFieldMapping } from '@/lib/webhook-fields';

export interface WebhookCardPayload {
  ticketNo: string;
  title: string;
  description: string;
  reporterName: string;
  department?: string | null;
  contactInfo: string;
  urgency: string;
  category?: string | null;
  portalUrl?: string;
  detail?: string;
  incident_type?: string;
}

export interface CustomEventPayload {
  detail: string;
  urgency?: string;
  incident_type?: string;
  ticketNo?: string;
  title?: string;
  description?: string;
  reporterName?: string;
  department?: string;
  contactInfo?: string;
  webhookUrl?: string;
  [key: string]: any;
}

export class WebhookService {
  /**
   * Builds outbound webhook JSON payload from configured field mappings
   */
  public static buildWebhookPayload(payload: WebhookCardPayload, customFields?: WebhookFieldMapping[]) {
    return buildWebhookPayload(payload, customFields);
  }

  /**
   * Legacy alias for default flat webhook JSON payload
   */
  public static buildPowerAutomatePayload(payload: WebhookCardPayload) {
    return this.buildWebhookPayload(payload);
  }

  private static resolveTargetUrl(dbUrlRaw?: string | null, customUrl?: string): string {
    if (customUrl) return customUrl;
    const dbUrl = (dbUrlRaw || '').trim();
    const envUrl = IntegrationService.getEnvWebhookUrl();
    if (dbUrl && !IntegrationService.isPlaceholderWebhookUrl(dbUrl) && dbUrl.startsWith('http')) {
      return dbUrl;
    }
    if (envUrl && !IntegrationService.isPlaceholderWebhookUrl(envUrl) && envUrl.startsWith('http')) {
      return envUrl;
    }
    return dbUrl || envUrl || '';
  }

  private static async sendWebhookJson(opts: {
    bodyPayload: Record<string, unknown>;
    ticketNo: string;
    channel: 'TEAMS' | 'CUSTOM_API';
    customUrl?: string;
    forceSend?: boolean;
  }): Promise<{ success: boolean; simulated: boolean; statusCode?: number; message: string; responseBody?: string }> {
    const { teams } = await IntegrationService.getRawConfig();

    if (!teams.isEnabled && !opts.forceSend && !opts.customUrl) {
      return {
        success: false,
        simulated: false,
        statusCode: 200,
        message: 'Outbound webhook notification is currently disabled in settings.',
      };
    }

    const webhookUrl = this.resolveTargetUrl(teams.webhookUrl, opts.customUrl);

    if (!webhookUrl || IntegrationService.isPlaceholderWebhookUrl(webhookUrl) || !webhookUrl.startsWith('http')) {
      await IntegrationService.logNotification({
        ticketNo: opts.ticketNo,
        channel: opts.channel,
        destination: 'Simulated (Unconfigured)',
        status: 'SUCCESS',
        statusCode: 200,
        payload: JSON.stringify(opts.bodyPayload),
        response: 'Dispatched in simulated mode',
      });
      return {
        success: true,
        simulated: true,
        statusCode: 200,
        message: 'Dispatched in simulated mode (Webhook URL not configured).',
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
        },
        body: JSON.stringify(opts.bodyPayload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const resText = await res.text();

      await IntegrationService.logNotification({
        ticketNo: opts.ticketNo,
        channel: opts.channel,
        destination: webhookUrl.slice(0, 80),
        status: res.ok ? 'SUCCESS' : 'FAILED',
        statusCode: res.status,
        payload: JSON.stringify(opts.bodyPayload),
        response: resText.slice(0, 500),
        errorMessage: res.ok ? null : `HTTP ${res.status}: ${resText.slice(0, 200)}`,
      });

      if (!res.ok) {
        return {
          success: false,
          simulated: false,
          statusCode: res.status,
          message: `Webhook returned status ${res.status}: ${resText}`,
          responseBody: resText,
        };
      }

      return {
        success: true,
        simulated: false,
        statusCode: res.status,
        message: 'Successfully dispatched to Webhook.',
        responseBody: resText,
      };
    } catch (err: any) {
      await IntegrationService.logNotification({
        ticketNo: opts.ticketNo,
        channel: opts.channel,
        destination: webhookUrl.slice(0, 80),
        status: 'FAILED',
        statusCode: 500,
        payload: JSON.stringify(opts.bodyPayload),
        errorMessage: err.message || 'Network / Timeout Error',
      });
      return {
        success: false,
        simulated: false,
        statusCode: 500,
        message: err.message || 'Failed to dispatch to webhook',
      };
    }
  }

  /**
   * Dispatches the event to the configured outbound Webhook using custom field mappings.
   */
  public static async dispatch(
    payload: WebhookCardPayload,
    customUrl?: string,
    forceSend = false
  ): Promise<{ success: boolean; simulated: boolean; statusCode?: number; message: string; responseBody?: string }> {
    const { teams } = await IntegrationService.getRawConfig();
    const bodyPayload = this.buildWebhookPayload(payload, teams.customFields);
    return this.sendWebhookJson({
      bodyPayload,
      ticketNo: payload.ticketNo,
      channel: 'TEAMS',
      customUrl,
      forceSend,
    });
  }

  /**
   * Replays a raw JSON object verbatim (for Delivery Logs resend when incident is absent).
   */
  public static async dispatchRawPayload(
    bodyPayload: Record<string, unknown>,
    opts?: { ticketNo?: string | null; channel?: 'TEAMS' | 'CUSTOM_API'; forceSend?: boolean }
  ): Promise<{ success: boolean; simulated: boolean; statusCode?: number; message: string; responseBody?: string }> {
    return this.sendWebhookJson({
      bodyPayload,
      ticketNo: opts?.ticketNo || 'RESEND-001',
      channel: opts?.channel === 'CUSTOM_API' ? 'CUSTOM_API' : 'TEAMS',
      forceSend: opts?.forceSend ?? true,
    });
  }

  /**
   * Generic event dispatcher for custom event payloads
   */
  public static async dispatchEvent(
    event: CustomEventPayload
  ): Promise<{ success: boolean; statusCode: number; message: string; responseBody?: string }> {
    const { teams } = await IntegrationService.getRawConfig();
    const webhookUrl = this.resolveTargetUrl(teams.webhookUrl, event.webhookUrl);

    if (!webhookUrl || IntegrationService.isPlaceholderWebhookUrl(webhookUrl) || !webhookUrl.startsWith('http')) {
      return {
        success: false,
        statusCode: 400,
        message: 'Webhook URL is missing or invalid.',
      };
    }

    const { webhookUrl: _ignored, ...restEvent } = event;

    const detail =
      event.detail ||
      (event.title
        ? `[${event.ticketNo || 'EVENT'}] ${event.title}\nรายละเอียด: ${event.description || '-'}\nผู้แจ้ง: ${event.reporterName || '-'} | แผนก: ${event.department || '-'} | ติดต่อ: ${event.contactInfo || '-'}`
        : 'New Event Dispatched');

    const bodyPayload = {
      ...restEvent,
      detail,
      urgency: event.urgency || 'MEDIUM',
      incident_type: event.incident_type || event.category || 'General',
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const resText = await res.text();

      await IntegrationService.logNotification({
        ticketNo: event.ticketNo || 'API_NOTIFY',
        channel: event.webhookUrl ? 'CUSTOM_API' : 'TEAMS',
        destination: webhookUrl.slice(0, 80),
        status: res.ok ? 'SUCCESS' : 'FAILED',
        statusCode: res.status,
        payload: JSON.stringify(bodyPayload),
        response: resText.slice(0, 500),
        errorMessage: res.ok ? null : `HTTP ${res.status}`,
      });

      return {
        success: res.ok,
        statusCode: res.status,
        message: res.ok ? 'Event dispatched successfully.' : `Webhook returned HTTP ${res.status}`,
        responseBody: resText,
      };
    } catch (err: any) {
      await IntegrationService.logNotification({
        ticketNo: event.ticketNo || 'API_NOTIFY',
        channel: event.webhookUrl ? 'CUSTOM_API' : 'TEAMS',
        destination: webhookUrl.slice(0, 80),
        status: 'FAILED',
        statusCode: 500,
        payload: JSON.stringify(bodyPayload),
        errorMessage: err.message || 'Error sending event',
      });
      return {
        success: false,
        statusCode: 500,
        message: err.message || 'Error sending event',
      };
    }
  }
}
