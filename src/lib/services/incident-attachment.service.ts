import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';
import { IncidentServiceError } from './incident-errors';
import { findIncidentByIdOrTicketNo } from './incident-shared';

export class IncidentAttachmentService {
  /**
   * Resolves root uploads directory, honoring UPLOADS_DIR env if set
   */
  public static getUploadsRoot(): string {
    return path.resolve(process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), 'public', 'uploads'));
  }

  /**
   * Saves an uploaded buffer under YYYY/MM/<ticketNo>/ or fallback YYYY/MM/
   */
  public static async saveUploadedFile(
    file: {
      buffer: Buffer;
      fileName: string;
      fileType: string;
      fileSize: number;
    },
    options?: {
      ticketNo?: string;
      kind?: 'REPORT' | 'RESOLUTION';
      date?: Date;
    }
  ): Promise<{ fileUrl: string; fileName: string; fileType: string; fileSize: number }> {
    const uploadRoot = this.getUploadsRoot();
    const d = options?.date ?? new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const safeTicket = options?.ticketNo?.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

    const relSegments: string[] = safeTicket ? [yyyy, mm, safeTicket] : [yyyy, mm];
    const targetDir = path.join(uploadRoot, ...relSegments);

    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    const safeName = file.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const prefix = options?.kind ? `${options.kind.toLowerCase()}_` : '';
    const uniqueFileName = `${prefix}${Date.now()}_${safeName}`;
    const targetPath = path.join(targetDir, uniqueFileName);

    await fs.promises.writeFile(targetPath, file.buffer);

    // Always use POSIX forward-slashes for fileUrl in database & URLs
    const fileUrl = `/uploads/${[...relSegments, uniqueFileName].join('/')}`;

    return {
      fileUrl,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
    };
  }

  /**
   * Attaches an evidence ("REPORT") or resolution ("RESOLUTION") file to an existing incident
   */
  public static async addAttachment(
    idOrTicketNo: string,
    file: { buffer: Buffer; fileName: string; fileType: string; fileSize: number },
    kind: 'REPORT' | 'RESOLUTION' = 'REPORT'
  ) {
    const target = await findIncidentByIdOrTicketNo(idOrTicketNo);
    if (!target) {
      throw new IncidentServiceError(`Incident not found: ${idOrTicketNo}`, 404);
    }
    if (['RESOLVED', 'CLOSED'].includes((target.status || '').trim().toUpperCase())) {
      throw new IncidentServiceError('Incident is closed; reopen to IN_PROGRESS before modifying attachments', 400);
    }

    const saved = await this.saveUploadedFile(file, {
      ticketNo: target.ticketNo,
      kind,
      date: target.createdAt,
    });
    return prisma.attachment.create({
      data: {
        incidentId: target.id,
        fileUrl: saved.fileUrl,
        fileName: saved.fileName,
        fileType: saved.fileType,
        fileSize: saved.fileSize,
        kind,
      },
    });
  }

  /**
   * Deletes an attachment belonging to the specified incident and cleans up local upload file
   */
  public static async deleteAttachment(idOrTicketNo: string, attachmentId: string) {
    const target = await findIncidentByIdOrTicketNo(idOrTicketNo);
    if (!target) {
      throw new IncidentServiceError(`Incident not found: ${idOrTicketNo}`, 404);
    }
    if (['RESOLVED', 'CLOSED'].includes((target.status || '').trim().toUpperCase())) {
      throw new IncidentServiceError('Incident is closed; reopen to IN_PROGRESS before modifying attachments', 400);
    }

    const att = await prisma.attachment.findFirst({
      where: { id: attachmentId, incidentId: target.id },
    });
    if (!att) {
      throw new IncidentServiceError(`Attachment not found: ${attachmentId}`, 404);
    }

    await prisma.attachment.delete({ where: { id: att.id } });

    if (att.fileUrl.startsWith('/uploads/')) {
      const uploadRoot = this.getUploadsRoot();
      const relPath = att.fileUrl.slice('/uploads/'.length);
      const segments = relPath.split('/').filter(Boolean);
      if (
        segments.length > 0 &&
        !segments.some(
          (s) => !s || s.startsWith('.') || s.includes('..') || s.includes('\\') || s.includes('\0')
        )
      ) {
        const filePath = path.resolve(uploadRoot, ...segments);
        if (filePath.startsWith(uploadRoot + path.sep)) {
          await fs.promises.unlink(filePath).catch(() => {});
        }
      }
    }
  }
}
