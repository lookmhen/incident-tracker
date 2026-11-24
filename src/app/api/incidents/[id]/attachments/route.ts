import { NextRequest, NextResponse } from 'next/server';
import { IncidentAttachmentService } from '@/lib/services/incident-attachment.service';
import { IncidentServiceError } from '@/lib/services/incident-errors';
import { checkApiAccess } from '@/lib/api-guard';
import { getActiveSession } from '@/lib/session';
import {
  ALLOWED_ATTACHMENT_LABEL,
  fallbackAttachmentFileName,
  isAllowedAttachment,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
  resolveAttachmentMime,
} from '@/lib/attachments';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await checkApiAccess(req, { requireAuth: true });
  if (denied) return denied;

  const session = await getActiveSession(req);
  if (session && session.role === 'MANAGER') {
    return NextResponse.json(
      { error: 'Managers cannot modify incident attachments' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
    }
    const rawFile = formData.get('file') || formData.get('attachment');
    const kindRaw = (typeof formData.get('kind') === 'string' ? (formData.get('kind') as string) : 'REPORT').toUpperCase();

    if (kindRaw !== 'REPORT' && kindRaw !== 'RESOLUTION') {
      return NextResponse.json({ error: 'kind must be REPORT or RESOLUTION' }, { status: 400 });
    }
    if (!(rawFile instanceof File) || rawFile.size === 0) {
      return NextResponse.json({ error: 'File is required and must not be empty' }, { status: 400 });
    }
    if (!isAllowedAttachment(rawFile.name, rawFile.type)) {
      return NextResponse.json(
        { error: `Unsupported file type. Allowed: ${ALLOWED_ATTACHMENT_LABEL}` },
        { status: 400 }
      );
    }
    if (rawFile.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: `Attachment exceeds maximum size of ${MAX_ATTACHMENT_MB}MB` },
        { status: 400 }
      );
    }

    const fileName = rawFile.name || fallbackAttachmentFileName(rawFile.type);
    const buffer = Buffer.from(await rawFile.arrayBuffer());
    const attachment = await IncidentAttachmentService.addAttachment(
      id,
      {
        buffer,
        fileName,
        fileType: resolveAttachmentMime(fileName, rawFile.type),
        fileSize: rawFile.size,
      },
      kindRaw
    );

    return NextResponse.json(attachment, { status: 201 });
  } catch (error: any) {
    if (error instanceof IncidentServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error?.message || 'Failed to upload attachment' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await checkApiAccess(req, { requireAuth: true });
  if (denied) return denied;

  const session = await getActiveSession(req);
  if (session && session.role === 'MANAGER') {
    return NextResponse.json(
      { error: 'Managers cannot modify incident attachments' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const attachmentId = new URL(req.url).searchParams.get('attachmentId')?.trim();
    if (!attachmentId) {
      return NextResponse.json({ error: 'attachmentId is required' }, { status: 400 });
    }

    await IncidentAttachmentService.deleteAttachment(id, attachmentId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof IncidentServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error?.message || 'Failed to delete attachment' }, { status: 500 });
  }
}
