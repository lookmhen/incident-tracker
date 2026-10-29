import { IntegrationService } from '@/lib/services/integration.service';

export interface TeamsCardPayload {
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

export class TeamsService {
  /**
   * Generates Microsoft Teams Adaptive Card v1.4 JSON
   */
  public static buildAdaptiveCard(payload: TeamsCardPayload) {
    const isHigh = payload.urgency.toUpperCase() === 'HIGH';
    const urgencyBadge = isHigh ? '🚨 HIGH PRIORITY IT INCIDENT' : payload.urgency.toUpperCase() === 'MEDIUM' ? '🟡 MEDIUM IT INCIDENT' : '🟢 LOW IT INCIDENT';
    const urgencyColor = isHigh ? 'Attention' : payload.urgency.toUpperCase() === 'MEDIUM' ? 'Warning' : 'Good';

    return {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            msteams: {
              width: 'Full',
            },
            body: [
              {
                type: 'Container',
                items: [
                  {
                    type: 'TextBlock',
                    text: urgencyBadge,
                    weight: 'Bolder',
                    color: urgencyColor,
                    size: 'Medium',
                  },
                  {
                    type: 'TextBlock',
                    text: `[${payload.ticketNo}] ${payload.title}`,
                    weight: 'Bolder',
                    size: 'Large',
                    wrap: true,
                  },
                ],
              },
              {
                type: 'FactSet',
                facts: [
                  {
                    title: 'Reporter:',
                    value: payload.reporterName,
                  },
                  {
                    title: 'Department:',
                    value: payload.department || 'N/A',
                  },
                  {
                    title: 'Contact:',
                    value: payload.contactInfo,
                  },
                  {
                    title: 'Urgency:',
                    value: payload.urgency,
                  },
                  {
                    title: 'Category:',
                    value: payload.category || 'Unassigned',
                  },
                  {
                    title: 'Timestamp:',
                    value: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                  },
                ],
              },
              {
                type: 'TextBlock',
                text: payload.description,
                wrap: true,
                spacing: 'Medium',
              },
            ],
            actions: [
              {
                type: 'Action.OpenUrl',
                title: 'Acknowledge in Portal',
                url: payload.portalUrl || `http://localhost:3000/admin/incidents/${payload.ticketNo}`,
              },
            ],
          },
        },
      ],
    };
  }

  /**
   * Builds Power Automate compatible JSON array/object:
   * { detail, urgency, incident_type, ...metadata }
   */
  public static buildPowerAutomatePayload(payload: TeamsCardPayload) {
    const formattedDetail =
      payload.detail ||
      `[${payload.ticketNo}] ${payload.title}\nรายละเอียด: ${payload.description}\nผู้แจ้ง: ${payload.reporterName} | แผนก: ${payload.department || '-'} | ติดต่อ: ${payload.contactInfo}`;

    return {
      detail: formattedDetail,
      urgency: payload.urgency,
      incident_type: payload.incident_type || payload.category || 'General IT',
      ticketNo: payload.ticketNo,
      title: payload.title,
      description: payload.description,
      reporterName: payload.reporterName,
      department: payload.department || '',
      contactInfo: payload.contactInfo,
      category: payload.category || 'General IT',
    };
  }

  /**
   * Dispatches the event to the configured Webhook (Power Automate, Teams, or Custom Webhook).
   */
  public static async dispatch(
    payload: TeamsCardPayload,
    customUrl?: string,
    forceSend = false
  ): Promise<{ success: boolean; simulated: boolean; statusCode?: number; message: string; responseBody?: string }> {
    const { teams } = await IntegrationService.getRawConfig();

    if (!teams.isEnabled && !forceSend && !customUrl) {
      return {
        success: false,
        simulated: false,
        statusCode: 200,
        message: 'Teams webhook notification is currently disabled in settings.',
      };
    }

    const webhookUrl = customUrl || teams.webhookUrl || process.env.TEAMS_WEBHOOK_URL;
    const bodyPayload =
      teams.payloadMode === 'adaptive_card'
        ? this.buildAdaptiveCard(payload)
        : this.buildPowerAutomatePayload(payload);

    if (!webhookUrl || webhookUrl.includes('your-webhook-url') || !webhookUrl.startsWith('http')) {
      await IntegrationService.logNotification({
        ticketNo: payload.ticketNo,
        channel: 'TEAMS',
        destination: 'Simulated (Unconfigured)',
        status: 'SUCCESS',
        statusCode: 200,
        payload: JSON.stringify(bodyPayload),
        response: 'Dispatched in simulated mode',
      });
      return {
        success: true,
        simulated: true,
        statusCode: 200,
        message: 'Dispatched in simulated mode (TEAMS_WEBHOOK_URL not configured).',
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
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const resText = await res.text();

      await IntegrationService.logNotification({
        ticketNo: payload.ticketNo,
        channel: 'TEAMS',
        destination: webhookUrl.slice(0, 80),
        status: res.ok ? 'SUCCESS' : 'FAILED',
        statusCode: res.status,
        payload: JSON.stringify(bodyPayload),
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
        ticketNo: payload.ticketNo,
        channel: 'TEAMS',
        destination: webhookUrl.slice(0, 80),
        status: 'FAILED',
        statusCode: 500,
        payload: JSON.stringify(bodyPayload),
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
   * Generic event dispatcher for custom event payloads
   */
  public static async dispatchEvent(
    event: CustomEventPayload
  ): Promise<{ success: boolean; statusCode: number; message: string; responseBody?: string }> {
    const { teams } = await IntegrationService.getRawConfig();
    const webhookUrl = event.webhookUrl || teams.webhookUrl || process.env.TEAMS_WEBHOOK_URL;

    if (!webhookUrl || !webhookUrl.startsWith('http')) {
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
