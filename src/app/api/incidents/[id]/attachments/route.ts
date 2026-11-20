import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/services/incident.service';
import { checkApiAccess } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await checkApiAccess(req, { requireAuth: true });
  if (denied) return denied;

  try {
    const { id } = await params;
    const formData = await req.formData();
    const uploadedFile = (formData.get('file') || formData.get('attachment')) as File | null;
    const kindRaw = ((formData.get('kind') as string | null) || 'REPORT').toUpperCase();

    if (kindRaw !== 'REPORT' && kindRaw !== 'RESOLUTION') {
      return NextResponse.json({ error: 'kind must be REPORT or RESOLUTION' }, { status: 400 });
    }
    if (!uploadedFile || uploadedFile.size === 0) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
    }
    if (!uploadedFile.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed (PNG, JPG, GIF, WebP)' }, { status: 400 });
    }
    if (uploadedFile.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Attachment exceeds maximum size of 5MB' }, { status: 400 });
    }

    const buffer = Buffer.from(await uploadedFile.arrayBuffer());
    const attachment = await IncidentService.addAttachment(
      id,
      {
        buffer,
        fileName: uploadedFile.name || `image_${Date.now()}.png`,
        fileType: uploadedFile.type,
        fileSize: uploadedFile.size,
      },
      kindRaw
    );

    return NextResponse.json(attachment, { status: 201 });
  } catch (error: any) {
    const msg = error?.message || 'Failed to upload attachment';
    if (msg.startsWith('Incident not found:')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes('Incident is closed')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await checkApiAccess(req, { requireAuth: true });
  if (denied) return denied;

  try {
    const { id } = await params;
    const attachmentId = new URL(req.url).searchParams.get('attachmentId')?.trim();
    if (!attachmentId) {
      return NextResponse.json({ error: 'attachmentId is required' }, { status: 400 });
    }

    await IncidentService.deleteAttachment(id, attachmentId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const msg = error?.message || 'Failed to delete attachment';
    if (msg.startsWith('Incident not found:') || msg.startsWith('Attachment not found:')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes('Incident is closed')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
