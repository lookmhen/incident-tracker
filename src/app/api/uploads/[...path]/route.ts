import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const INLINE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const DOWNLOAD_MIME_TYPES: Record<string, string> = {
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xml': 'application/xml; charset=utf-8',
  '.zip': 'application/zip',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  if (
    !Array.isArray(segments) ||
    segments.length === 0 ||
    segments.some(
      (s) =>
        !s ||
        s.startsWith('.') ||
        s.includes('..') ||
        s.includes('/') ||
        s.includes('\\') ||
        s.includes('\0')
    )
  ) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const uploadDir = path.resolve(
    /*turbopackIgnore: true*/
    process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), 'public', 'uploads')
  );
  const filePath = path.resolve(/*turbopackIgnore: true*/ uploadDir, ...segments);

  // Guard against resolved path escaping uploadDir
  if (!filePath.startsWith(uploadDir + path.sep)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const data = await fs.promises.readFile(filePath);
    const lastSegment = segments[segments.length - 1];
    const ext = path.extname(lastSegment).toLowerCase();
    const inlineMime = INLINE_MIME_TYPES[ext];
    const contentType = inlineMime || DOWNLOAD_MIME_TYPES[ext] || 'application/octet-stream';

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(data.byteLength),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    };

    if (!inlineMime) {
      headers['Content-Disposition'] = `attachment; filename="${path.basename(lastSegment).replace(/["\r\n]/g, '')}"`;
    }

    return new NextResponse(data, { status: 200, headers });
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }
    console.error('Error serving upload:', err);
    return NextResponse.json({ error: 'Failed to read attachment' }, { status: 500 });
  }
}
