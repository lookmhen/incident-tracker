import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { GET as uploadGetHandler } from '../src/app/api/uploads/[filename]/route';
import { IncidentService } from '../src/lib/services/incident.service';

describe('11. Dynamic Upload Serving (/api/uploads/[filename])', () => {
  it('serves a newly saved upload with proper headers and cleans up', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const saved = await IncidentService.saveUploadedFile({
      buffer: pngHeader,
      fileName: 'test screenshot.png',
      fileType: 'image/png',
      fileSize: pngHeader.length,
    });

    assert.ok(saved.fileUrl.startsWith('/uploads/'));
    const filename = saved.fileUrl.replace('/uploads/', '');
    const savedPath = path.join(process.cwd(), 'public', 'uploads', filename);

    try {
      const req = new NextRequest(`http://localhost:3000/api/uploads/${filename}`);
      const res = await uploadGetHandler(req, { params: Promise.resolve({ filename }) });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');

      const body = Buffer.from(await res.arrayBuffer());
      assert.deepEqual(body, pngHeader);
    } finally {
      await fs.promises.unlink(savedPath).catch(() => {});
    }
  });

  it('forces download for active/unknown extensions like .html', async () => {
    const htmlBuf = Buffer.from('<script>alert(1)</script>');
    const saved = await IncidentService.saveUploadedFile({
      buffer: htmlBuf,
      fileName: 'xss.html',
      fileType: 'text/html',
      fileSize: htmlBuf.length,
    });

    const filename = saved.fileUrl.replace('/uploads/', '');
    const savedPath = path.join(process.cwd(), 'public', 'uploads', filename);

    try {
      const req = new NextRequest(`http://localhost:3000/api/uploads/${filename}`);
      const res = await uploadGetHandler(req, { params: Promise.resolve({ filename }) });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/octet-stream');
      assert.ok(res.headers.get('content-disposition')?.includes('attachment'));
    } finally {
      await fs.promises.unlink(savedPath).catch(() => {});
    }
  });

  it('returns 404 for missing attachments', async () => {
    const req = new NextRequest('http://localhost:3000/api/uploads/does-not-exist.png');
    const res = await uploadGetHandler(req, {
      params: Promise.resolve({ filename: 'does-not-exist.png' }),
    });
    assert.equal(res.status, 404);
  });

  it('blocks path traversal and hidden dotfiles', async () => {
    for (const bad of ['../.env', '..\\package.json', '.gitkeep', 'sub/file.png']) {
      const req = new NextRequest('http://localhost:3000/api/uploads/bad');
      const res = await uploadGetHandler(req, { params: Promise.resolve({ filename: bad }) });
      assert.equal(res.status, 400, `Expected 400 for ${bad}`);
    }
  });

  it('serves PDF inline and Office Excel (.xlsx) as download with proper MIME type', async () => {
    const pdfSaved = await IncidentService.saveUploadedFile({
      buffer: Buffer.from('%PDF-1.4\n'),
      fileName: 'sop-guide.pdf',
      fileType: 'application/pdf',
      fileSize: 9,
    });
    const xlsxSaved = await IncidentService.saveUploadedFile({
      buffer: Buffer.from('PK\x03\x04dummy'),
      fileName: 'stock-report.xlsx',
      fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: 9,
    });

    const pdfName = pdfSaved.fileUrl.replace('/uploads/', '');
    const xlsxName = xlsxSaved.fileUrl.replace('/uploads/', '');
    const pdfPath = path.join(process.cwd(), 'public', 'uploads', pdfName);
    const xlsxPath = path.join(process.cwd(), 'public', 'uploads', xlsxName);

    try {
      const pdfRes = await uploadGetHandler(new NextRequest(`http://localhost:3000/api/uploads/${pdfName}`), {
        params: Promise.resolve({ filename: pdfName }),
      });
      assert.equal(pdfRes.status, 200);
      assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
      assert.equal(pdfRes.headers.get('content-disposition'), null);

      const xlsxRes = await uploadGetHandler(new NextRequest(`http://localhost:3000/api/uploads/${xlsxName}`), {
        params: Promise.resolve({ filename: xlsxName }),
      });
      assert.equal(xlsxRes.status, 200);
      assert.equal(
        xlsxRes.headers.get('content-type'),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      assert.ok(xlsxRes.headers.get('content-disposition')?.includes('attachment'));
    } finally {
      await fs.promises.unlink(pdfPath).catch(() => {});
      await fs.promises.unlink(xlsxPath).catch(() => {});
    }
  });
});
