import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/services/incident.service';
import { EmailService } from '@/lib/services/email.service';
import { checkApiAccess } from '@/lib/api-guard';
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

export async function GET(req: NextRequest) {
  const denied = await checkApiAccess(req, { requireAuth: true });
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const status = searchParams.get('status') || undefined;
    const urgency = searchParams.get('urgency') || undefined;
    const category = searchParams.get('category') || undefined;
    const department = searchParams.get('department') || undefined;
    const resolvedByExternal = searchParams.get('resolvedByExternal') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await IncidentService.getIncidents({
      search,
      status,
      urgency,
      category,
      department,
      resolvedByExternal,
      page,
      limit,
    });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('Error fetching incidents:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    let reporterName = '';
    let department = '';
    let contactInfo = '';
    let title = '';
    let description = '';
    let urgency: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    let category = '';
    let categoryId = '';
    let filePayload: { buffer: Buffer; fileName: string; fileType: string; fileSize: number } | undefined;

    if (contentType.includes('multipart/form-data')) {
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
      }
      reporterName = String(formData.get('reporterName') || '');
      department = String(formData.get('department') || '');
      contactInfo = String(formData.get('contactInfo') || '');
      title = String(formData.get('title') || '');
      description = String(formData.get('description') || '');
      urgency = (String(formData.get('urgency') || 'LOW')) as any;
      category = String(formData.get('category') || '');
      categoryId = String(formData.get('categoryId') || '');

      const rawAttachment = formData.get('attachment');
      if (rawAttachment instanceof File) {
        if (rawAttachment.size === 0) {
          if (rawAttachment.name) {
            return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
          }
        } else {
          if (!isAllowedAttachment(rawAttachment.name, rawAttachment.type)) {
            return NextResponse.json(
              { error: `Unsupported file type. Allowed: ${ALLOWED_ATTACHMENT_LABEL}` },
              { status: 400 }
            );
          }
          if (rawAttachment.size > MAX_ATTACHMENT_BYTES) {
            return NextResponse.json(
              { error: `Attachment exceeds maximum size of ${MAX_ATTACHMENT_MB}MB` },
              { status: 400 }
            );
          }
          const fileName = rawAttachment.name || fallbackAttachmentFileName(rawAttachment.type);
          const arrayBuffer = await rawAttachment.arrayBuffer();
          filePayload = {
            buffer: Buffer.from(arrayBuffer),
            fileName,
            fileType: resolveAttachmentMime(fileName, rawAttachment.type),
            fileSize: rawAttachment.size,
          };
        }
      } else if (rawAttachment !== null && rawAttachment !== '') {
        return NextResponse.json({ error: 'Invalid attachment field' }, { status: 400 });
      }
    } else {
      let json: any;
      try {
        json = await req.json();
      } catch {
        return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
      }
      reporterName = json?.reporterName;
      department = json?.department || '';
      contactInfo = json?.contactInfo;
      title = json?.title;
      description = json?.description;
      urgency = json?.urgency || 'LOW';
      category = json?.category || '';
      categoryId = json?.categoryId || '';

      if (json?.fileBase64 !== undefined || json?.fileName !== undefined) {
        if (typeof json.fileBase64 === 'string' && typeof json.fileName === 'string' && json.fileName.trim()) {
          if (!isAllowedAttachment(json.fileName, json.fileType)) {
            return NextResponse.json(
              { error: `Unsupported file type. Allowed: ${ALLOWED_ATTACHMENT_LABEL}` },
              { status: 400 }
            );
          }
          const buffer = Buffer.from(json.fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
          if (buffer.length === 0) {
            return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
          }
          if (buffer.length > MAX_ATTACHMENT_BYTES) {
            return NextResponse.json(
              { error: `Attachment exceeds maximum size of ${MAX_ATTACHMENT_MB}MB` },
              { status: 400 }
            );
          }
          filePayload = {
            buffer,
            fileName: json.fileName,
            fileType: resolveAttachmentMime(json.fileName, json.fileType),
            fileSize: buffer.length,
          };
        } else if (json?.fileBase64 || json?.fileName) {
          return NextResponse.json({ error: 'Invalid attachment payload' }, { status: 400 });
        }
      }
    }

    // If contactInfo is not provided, fallback to '-' or department
    contactInfo = contactInfo?.trim() || department?.trim() || '-';

    if (!reporterName?.trim() || !department?.trim() || !title?.trim() || !description?.trim()) {
      return NextResponse.json(
        { error: 'Please provide all required fields (reporterName, department, title, description)' },
        { status: 400 }
      );
    }

    const created = await IncidentService.createIncident({
      reporterName,
      department,
      contactInfo,
      title,
      description,
      urgency,
      category,
      categoryId,
      portalBaseUrl: EmailService.resolvePortalUrl(req),
      file: filePayload,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error('Error creating incident:', error);
    return NextResponse.json({ error: error.message || 'Failed to create incident' }, { status: 500 });
  }
}
