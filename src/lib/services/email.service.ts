import nodemailer from 'nodemailer';
import prisma from '@/lib/prisma';
import { IntegrationService, SmtpIntegrationSettings } from '@/lib/services/integration.service';

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
  private static createTransporter(smtp: SmtpIntegrationSettings) {
    return nodemailer.createTransport({
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
  }

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
                  📎 <strong>ไฟล์แนบ (Attachment):</strong> <a href="${escapeHtml(attachmentLink)}" style="color: #0284c7; font-weight: 600; text-decoration: underline;">คลิกเพื่อเปิดดู / ดาวน์โหลดไฟล์</a>
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

    const textBody = `[${payload.ticketNo}] ${payload.title}\nระดับความเร่งด่วน: ${payload.urgency}\nผู้แจ้ง: ${payload.reporterName} (${payload.department || '-'}, ${payload.contactInfo})\nรายละเอียด: ${payload.description}\n${attachmentLink ? `ไฟล์แนบ: ${attachmentLink}\n` : ''}จัดการเคส: ${detailLink}`;

    try {
      const transporter = this.createTransporter(smtp);

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

  /**
   * Sends a Manager confirmation email when Staff moves an incident to PENDING_CONFIRM.
   * Never throws on disabled SMTP, missing recipients, or transport failure.
   */
  public static async sendManagerConfirmRequest(payload: {
    ticketNo: string;
    title: string;
    description?: string;
    assignedTo?: string | null;
    resolution?: string | null;
    resolutionType?: string | null;
    workaroundNote?: string | null;
    category?: string | null;
    rootCause?: string | null;
    portalBaseUrl?: string;
  }): Promise<{ success: boolean; statusCode: number; message: string }> {
    const { smtp } = await IntegrationService.getRawConfig();

    if (!smtp.isEnabled) {
      return {
        success: false,
        statusCode: 200,
        message: 'Email notification is currently disabled in settings.',
      };
    }

    const managers = await prisma.adminUser.findMany({
      where: { role: 'MANAGER', isActive: true, email: { not: null } },
      select: { email: true },
    });

    const dedupeEmails = (emails: string[]) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of emails) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(trimmed);
        }
      }
      return out;
    };

    let recipients = dedupeEmails(managers.map((m) => m.email || ''));
    if (recipients.length === 0) {
      recipients = dedupeEmails((smtp.recipientEmails || '').split(','));
    }

    if (recipients.length === 0 || !smtp.host) {
      return {
        success: false,
        statusCode: 200,
        message: 'No active Manager recipients or SMTP host configured.',
      };
    }

    const baseUrl = (payload.portalBaseUrl || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '')
      .trim()
      .replace(/\/+$/, '');
    const detailLink = baseUrl ? `${baseUrl}/admin/incidents/${encodeURIComponent(payload.ticketNo)}` : null;

    const resolutionTypeLabel =
      payload.resolutionType === 'WORKAROUND'
        ? 'Workaround (แก้ไขชั่วคราว)'
        : payload.resolutionType === 'PERMANENT'
          ? 'Permanent Fix (แก้ไขถาวร)'
          : payload.resolutionType || 'Permanent Fix (แก้ไขถาวร)';

    const subject = `[IncidentHub] รอ Manager ยืนยันปิดเคส ${payload.ticketNo}: ${payload.title}`;

    const htmlBody = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
        <div style="background-color: #7c3aed; color: #ffffff; padding: 16px 24px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">
            Pending Manager Confirmation
          </div>
          <h2 style="margin: 6px 0 0 0; font-size: 18px;">[${escapeHtml(payload.ticketNo)}] ${escapeHtml(payload.title)}</h2>
        </div>
        <div style="padding: 24px; color: #1e293b; font-size: 14px; line-height: 1.6;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; background-color: #f8fafc; border-radius: 8px; padding: 12px;">
            <tr>
              <td style="padding: 8px 12px; color: #64748b; font-size: 12px; width: 150px;"><strong>ผู้รับผิดชอบ (Assigned To):</strong></td>
              <td style="padding: 8px 12px; color: #0f172a; font-weight: 600;">${escapeHtml(payload.assignedTo || '-')}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; color: #64748b; font-size: 12px;"><strong>หมวดหมู่ (Category):</strong></td>
              <td style="padding: 8px 12px; color: #0f172a;">${escapeHtml(payload.category || '-')}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; color: #64748b; font-size: 12px;"><strong>สาเหตุหลัก (Root Cause):</strong></td>
              <td style="padding: 8px 12px; color: #0f172a;">${escapeHtml(payload.rootCause || '-')}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; color: #64748b; font-size: 12px;"><strong>ประเภทการปิดเคส (Resolution Type):</strong></td>
              <td style="padding: 8px 12px; color: #0f172a; font-weight: 600;">${escapeHtml(resolutionTypeLabel)}</td>
            </tr>
          </table>

          ${
            payload.description
              ? `<div style="margin-bottom: 16px;">
                  <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 6px;">
                    รายละเอียดปัญหา (Description):
                  </div>
                  <div style="background-color: #f1f5f9; border-left: 4px solid #64748b; padding: 12px 16px; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(payload.description)}</div>
                </div>`
              : ''
          }

          <div style="margin-bottom: 16px;">
            <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 6px;">
              บันทึกการแก้ไข (Resolution):
            </div>
            <div style="background-color: #f5f3ff; border-left: 4px solid #7c3aed; padding: 12px 16px; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(payload.resolution || '-')}</div>
          </div>

          ${
            payload.workaroundNote
              ? `<div style="margin-bottom: 16px;">
                  <div style="font-size: 12px; font-weight: 700; color: #b45309; text-transform: uppercase; margin-bottom: 6px;">
                    หมายเหตุ Workaround (Workaround Note):
                  </div>
                  <div style="background-color: #fffbeb; border-left: 4px solid #d97706; padding: 12px 16px; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(payload.workaroundNote)}</div>
                </div>`
              : ''
          }

          ${
            detailLink
              ? `<div style="margin-top: 24px;">
                  <a href="${escapeHtml(detailLink)}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 13px;">
                    ตรวจสอบและยืนยันปิดเคส (Confirm Closure) &rarr;
                  </a>
                </div>`
              : ''
          }
        </div>
        <div style="background-color: #f8fafc; padding: 12px 24px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
          Sent automatically by IncidentHub Notification Engine
        </div>
      </div>
    `;

    const textBody = [
      `[${payload.ticketNo}] ${payload.title}`,
      `ผู้รับผิดชอบ: ${payload.assignedTo || '-'}`,
      `หมวดหมู่: ${payload.category || '-'}`,
      `Root Cause: ${payload.rootCause || '-'}`,
      `ประเภทการปิดเคส: ${resolutionTypeLabel}`,
      payload.description ? `รายละเอียด: ${payload.description}` : null,
      `บันทึกการแก้ไข: ${payload.resolution || '-'}`,
      payload.workaroundNote ? `หมายเหตุ Workaround: ${payload.workaroundNote}` : null,
      detailLink ? `ยืนยันปิดเคส: ${detailLink}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const transporter = this.createTransporter(smtp);

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
        payload: JSON.stringify({ subject, to: recipients, detailLink, resolutionType: payload.resolutionType }),
        response: `MessageId: ${info.messageId}`,
      });

      return {
        success: true,
        statusCode: 250,
        message: `Confirmation request sent to ${recipients.join(', ')}`,
      };
    } catch (err: any) {
      const errMsg = err?.message || 'SMTP dispatch failed';
      await IntegrationService.logNotification({
        ticketNo: payload.ticketNo,
        channel: 'EMAIL',
        destination: recipients.join(', '),
        status: 'FAILED',
        statusCode: 500,
        payload: JSON.stringify({ subject, to: recipients, detailLink, resolutionType: payload.resolutionType }),
        errorMessage: errMsg,
      });

      return {
        success: false,
        statusCode: 500,
        message: errMsg,
      };
    }
  }

  /**
   * Sends a self-registration invite link to a new STAFF or MANAGER user.
   */
  public static async sendUserInviteEmail(payload: {
    email: string;
    name: string;
    role: 'STAFF' | 'MANAGER';
    inviteUrl: string;
    invitedBy?: string;
  }): Promise<{ success: boolean; statusCode: number; message: string }> {
    const { smtp } = await IntegrationService.getRawConfig();

    if (!smtp.isEnabled || !smtp.host) {
      return {
        success: false,
        statusCode: 200,
        message: 'SMTP is disabled or not configured (copy the invite link manually).',
      };
    }

    const subject = `[IncidentHub] คำเชิญเข้าใช้งานระบบผู้ดูแล (${payload.role})`;
    const htmlBody = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
        <div style="background-color: #0284c7; color: #ffffff; padding: 16px 24px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">
            IncidentHub Team Invitation
          </div>
          <h2 style="margin: 6px 0 0 0; font-size: 18px;">คุณได้รับเชิญเข้าใช้งานระบบผู้ดูแล</h2>
        </div>
        <div style="padding: 24px; color: #1e293b; font-size: 14px; line-height: 1.6;">
          <p>สวัสดีคุณ <strong>${escapeHtml(payload.name)}</strong>,</p>
          <p>
            ${escapeHtml(payload.invitedBy || 'ผู้ดูแลระบบ')} ได้เชิญคุณเข้าร่วมทีมจัดการ Incident ในสิทธิ์
            <strong>${escapeHtml(payload.role)}</strong>
          </p>
          <p>กรุณากดปุ่มด้านล่างเพื่อตั้งรหัสผ่านและเข้าใช้งานด้วย Email ของคุณ (ลิงก์มีอายุ 48 ชั่วโมง และใช้ได้ 1 ครั้ง):</p>
          <div style="margin: 24px 0;">
            <a href="${escapeHtml(payload.inviteUrl)}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 600; font-size: 13px;">
              ตั้งรหัสผ่านและเข้าใช้งาน &rarr;
            </a>
          </div>
          <p style="font-size: 12px; color: #64748b; word-break: break-all;">
            หากปุ่มกดไม่ได้ สามารถคัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์:<br/>
            ${escapeHtml(payload.inviteUrl)}
          </p>
        </div>
      </div>
    `;
    const textBody = `สวัสดีคุณ ${payload.name},\nคุณได้รับเชิญเข้าใช้งาน IncidentHub (${payload.role}) โดย ${payload.invitedBy || 'Admin'}\nตั้งรหัสผ่านเพื่อเข้าใช้งานด้วย Email ${payload.email} ได้ที่ (อายุ 48 ชม.):\n${payload.inviteUrl}`;

    try {
      const transporter = this.createTransporter(smtp);
      const info = await transporter.sendMail({
        from: smtp.senderEmail || smtp.username || 'incidenthub@company.internal',
        to: payload.email,
        subject,
        text: textBody,
        html: htmlBody,
      });

      await IntegrationService.logNotification({
        ticketNo: 'INVITE',
        channel: 'EMAIL',
        destination: payload.email,
        status: 'SUCCESS',
        statusCode: 250,
        payload: JSON.stringify({ subject, to: payload.email, role: payload.role }),
        response: `MessageId: ${info.messageId}`,
      });

      return {
        success: true,
        statusCode: 250,
        message: `Invite email sent to ${payload.email}`,
      };
    } catch (err: any) {
      const errMsg = err?.message || 'SMTP invite dispatch failed';
      await IntegrationService.logNotification({
        ticketNo: 'INVITE',
        channel: 'EMAIL',
        destination: payload.email,
        status: 'FAILED',
        statusCode: 500,
        payload: JSON.stringify({ subject, to: payload.email, role: payload.role }),
        errorMessage: errMsg,
      });
      return { success: false, statusCode: 500, message: errMsg };
    }
  }
}
