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

export class EmailService {
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

    const baseUrl = payload.portalBaseUrl || `http://localhost:${process.env.PORT || 3000}`;
    const detailLink = `${baseUrl}/admin/incidents/${payload.ticketNo}`;
    const attachmentLink = payload.attachmentUrl ? `${baseUrl}${payload.attachmentUrl}` : null;

    const urgencyColor =
      payload.urgency === 'HIGH' ? '#dc2626' : payload.urgency === 'MEDIUM' ? '#d97706' : '#0284c7';

    const subject = `[${payload.urgency}] IT Incident ${payload.ticketNo}: ${payload.title}`;

    const htmlBody = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
        <div style="background-color: ${urgencyColor}; color: #ffffff; padding: 16px 24px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">
            IT Incident Notification • ${payload.urgency} Priority
          </div>
          <h2 style="margin: 6px 0 0 0; font-size: 18px;">[${payload.ticketNo}] ${payload.title}</h2>
        </div>
        <div style="padding: 24px; color: #1e293b; font-size: 14px; line-height: 1.6;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; background-color: #f8fafc; border-radius: 8px; padding: 12px;">
            <tr>
              <td style="padding: 8px 12px; color: #64748b; font-size: 12px; width: 130px;"><strong>ผู้แจ้ง (Reporter):</strong></td>
              <td style="padding: 8px 12px; color: #0f172a; font-weight: 600;">${payload.reporterName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; color: #64748b; font-size: 12px;"><strong>แผนก (Department):</strong></td>
              <td style="padding: 8px 12px; color: #0f172a;">${payload.department || '-'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; color: #64748b; font-size: 12px;"><strong>ติดต่อ (Contact):</strong></td>
              <td style="padding: 8px 12px; color: #0f172a;">${payload.contactInfo}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; color: #64748b; font-size: 12px;"><strong>หมวดหมู่ (Category):</strong></td>
              <td style="padding: 8px 12px; color: #0f172a;">${payload.category || 'General IT'}</td>
            </tr>
          </table>

          <div style="margin-bottom: 16px;">
            <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 6px;">
              รายละเอียดปัญหา (Description):
            </div>
            <div style="background-color: #f1f5f9; border-left: 4px solid #0284c7; padding: 12px 16px; border-radius: 4px; white-space: pre-wrap;">${payload.description}</div>
          </div>

          ${
            attachmentLink
              ? `<div style="margin-bottom: 20px; padding: 10px 14px; background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; font-size: 13px;">
                  📎 <strong>ไฟล์ภาพแนบ (Screenshot):</strong> <a href="${attachmentLink}" style="color: #0284c7; font-weight: 600; text-decoration: underline;">คลิกเพื่อเปิดดูรูปภาพบนเว็บ</a>
                </div>`
              : ''
          }

          <div style="margin-top: 24px;">
            <a href="${detailLink}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 13px;">
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
        auth:
          smtp.username && smtp.password
            ? {
                user: smtp.username,
                pass: smtp.password,
              }
            : undefined,
        tls: {
          rejectUnauthorized: false,
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
