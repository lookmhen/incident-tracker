import nodemailer from 'nodemailer';
import { IntegrationService } from '@/lib/services/integration.service';

export interface EmailIncidentPayload {
  ticketNo: string;
  title: string;
  description: string;
  reporterName: string;
  department?: string | null;
  contactInfo: string;
  urgency: string;
  category?: string | null;
  attachmentUrl?: string | null;
  portalBaseUrl?: string;
}

function escapeHtml(val?: string | null): string {
  if (!val) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class EmailService {
  /**
   * Resolves the external portal base URL from APP_URL env or incoming request headers.
   */
  public static resolvePortalUrl(req?: {
    headers: { get(name: string): string | null };
    url?: string;
  }): string | undefined {
    const envUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
    if (envUrl) return envUrl;
    if (!req) return undefined;

    const rawHost = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim();
    if (!rawHost || rawHost.startsWith('0.0.0.0')) return undefined;
    const rawProto = (req.headers.get('x-forwarded-proto') || '').split(',')[0].trim();
    const proto = rawProto || (req.url?.startsWith('https://') ? 'https' : 'http');
    return `${proto}://${rawHost}`;
  }

  /**
   * Sends an incident alert email via configured SMTP server.
   * Includes a web link to view attachments rather than heavy binary attachments.
   */
  public static async dispatch(
    payload: EmailIncidentPayload,
    forceSend = false
  ): Promise<{ success: boolean; statusCode: number; message: string }> {
    const { smtp } = await IntegrationService.getRawConfig();

    if (!smtp.isEnabled && !forceSend) {
      return {
        success: false,
        statusCode: 200,
        message: 'Email notification is currently disabled in settings.',
      };
    }

    const recipients = smtp.recipientEmails
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);

    if (!smtp.host || recipients.length === 0) {
      const errMsg = 'SMTP Host or Admin Recipient Emails not configured.';
      await IntegrationService.logNotification({
        ticketNo: payload.ticketNo,
        channel: 'EMAIL',
        destination: smtp.recipientEmails || 'Unconfigured',
        status: 'FAILED',
        statusCode: 400,
        payload: JSON.stringify(payload),
        errorMessage: errMsg,
      });
      return { success: false, statusCode: 400, message: errMsg };
    }

    const envBaseUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
    const baseUrl = (payload.portalBaseUrl || envBaseUrl || `http://localhost:${process.env.PORT || 3000}`).replace(
      /\/+$/,
      ''
    );
    const detailLink = `${baseUrl}/admin/incidents/${encodeURIComponent(payload.ticketNo)}`;
    const attachmentLink = payload.attachmentUrl
      ? `${baseUrl}${payload.attachmentUrl.startsWith('/') ? '' : '/'}${payload.attachmentUrl}`
      : null;

    const urgencyColor =
      payload.urgency === 'HIGH' ? '#dc2626' : payload.urgency === 'MEDIUM' ? '#d97706' : '#0284c7';

    const subject = `[${payload.urgency}] IT Incident ${payload.ticketNo}: ${payload.title}`;

    const htmlBody = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
        <div style="background-color: ${urgencyColor}; color: #ffffff; padding: 16px 24px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">
            IT Incident Notification • ${escapeHtml(payload.urgency)} Priority
          </div>
          <h2 style="margin: 6px 0 0 0; font-size: 18px;">[${escapeHtml(payload.ticketNo)}] ${escapeHtml(payload.title)}</h2>
        </div>
        <div style="padding: 24px; color: #1e293b; font-size: 14px; line-height: 1.6;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; background-color: #f8fafc; border-radius: 8px; padding: 12px;">
            <tr>
              <td style="padding: 8px 12px; color: #64748b; font-size: 12px; width: 130px;"><strong>ผู้แจ้ง (Reporter):</strong></td>
              <td style="padding: 8px 12px; color: #0f172a; font-weight: 600;">${escapeHtml(payload.reporterName)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; color: #64748b; font-size: 12px;"><strong>แผนก (Department):</strong></td>
              <td style="padding: 8px 12px; color: #0f172a;">${escapeHtml(payload.department || '-')}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; color: #64748b; font-size: 12px;"><strong>ติดต่อ (Contact):</strong></td>
              <td style="padding: 8px 12px; color: #0f172a;">${escapeHtml(payload.contactInfo)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; color: #64748b; font-size: 12px;"><strong>หมวดหมู่ (Category):</strong></td>
              <td style="padding: 8px 12px; color: #0f172a;">${escapeHtml(payload.category || 'General IT')}</td>
            </tr>
          </table>

          <div style="margin-bottom: 16px;">
            <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 6px;">
              รายละเอียดปัญหา (Description):
            </div>
            <div style="background-color: #f1f5f9; border-left: 4px solid #0284c7; padding: 12px 16px; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(payload.description)}</div>
          </div>

          ${
            attachmentLink
              ? `<div style="margin-bottom: 20px; padding: 10px 14px; background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; font-size: 13px;">
                  📎 <strong>ไฟล์ภาพแนบ (Screenshot):</strong> <a href="${escapeHtml(attachmentLink)}" style="color: #0284c7; font-weight: 600; text-decoration: underline;">คลิกเพื่อเปิดดูรูปภาพบนเว็บ</a>
                </div>`
              : ''
          }

          <div style="margin-top: 24px;">
            <a href="${escapeHtml(detailLink)}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 13px;">
              Acknowledge &amp; Resolve in Portal &rarr;
            </a>
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 12px 24px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
          Sent automatically by IncidentHub Notification Engine
        </div>
      </div>
    `;

    const textBody = `[${payload.ticketNo}] ${payload.title}\nระดับความเร่งด่วน: ${payload.urgency}\nผู้แจ้ง: ${payload.reporterName} (${payload.department || '-'}, ${payload.contactInfo})\nรายละเอียด: ${payload.description}\n${attachmentLink ? `ดูรูปแนบ: ${attachmentLink}\n` : ''}จัดการเคส: ${detailLink}`;

    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.encryption === 'SSL' || smtp.port === 465,
        ignoreTLS: smtp.encryption === 'NONE',
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        auth:
          smtp.username && smtp.password
            ? {
                user: smtp.username,
                pass: smtp.password,
              }
            : undefined,
        tls:
          smtp.encryption === 'NONE'
            ? undefined
            : {
                rejectUnauthorized: process.env.SMTP_STRICT_TLS === 'true',
              },
      });

      const info = await transporter.sendMail({
        from: smtp.senderEmail || smtp.username || 'incidenthub@company.internal',
        to: recipients.join(', '),
        subject,
        text: textBody,
        html: htmlBody,
      });

      await IntegrationService.logNotification({
        ticketNo: payload.ticketNo,
        channel: 'EMAIL',
        destination: recipients.join(', '),
        status: 'SUCCESS',
        statusCode: 250,
        payload: JSON.stringify({ subject, to: recipients, attachmentLink }),
        response: `MessageId: ${info.messageId}`,
      });

      return {
        success: true,
        statusCode: 250,
        message: `Email sent successfully to ${recipients.join(', ')}`,
      };
    } catch (err: any) {
      const errMsg = err.message || 'SMTP dispatch failed';
      await IntegrationService.logNotification({
        ticketNo: payload.ticketNo,
        channel: 'EMAIL',
        destination: recipients.join(', '),
        status: 'FAILED',
        statusCode: 500,
        payload: JSON.stringify({ subject, to: recipients, attachmentLink }),
        errorMessage: errMsg,
      });

      return {
        success: false,
        statusCode: 500,
        message: errMsg,
      };
    }
  }
}
