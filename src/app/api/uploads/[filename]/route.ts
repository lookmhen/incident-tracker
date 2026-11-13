import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const MIME_TYPES: Record<string, string> = {
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  if (
    !filename ||
    filename.startsWith('.') ||
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0')
  ) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const uploadDir = path.resolve(process.cwd(), 'public', 'uploads');
  const filePath = path.resolve(uploadDir, filename);

  // Guard against resolved path escaping public/uploads
  if (!filePath.startsWith(uploadDir + path.sep)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(data.byteLength),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    };

    if (!MIME_TYPES[ext]) {
      headers['Content-Disposition'] = `attachment; filename="${path.basename(filename).replace(/"/g, '')}"`;
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
