import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { GET as uploadGetHandler } from '../src/app/api/uploads/[...path]/route';
import { IncidentService } from '../src/lib/services/incident.service';
import { backupDatabase } from '../scripts/backup-db';

describe('11. Dynamic Upload Serving (/api/uploads/[...path])', () => {
  const invokeHandler = (parts: string | string[]) => {
    const segments = Array.isArray(parts) ? parts : parts.split('/');
    const url = `http://localhost:3000/api/uploads/${segments.join('/')}`;
    return uploadGetHandler(new NextRequest(url), {
      params: Promise.resolve({ path: segments }),
    });
  };

  it('serves a newly saved upload with proper headers and cleans up', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const saved = await IncidentService.saveUploadedFile({
      buffer: pngHeader,
      fileName: 'test screenshot.png',
      fileType: 'image/png',
      fileSize: pngHeader.length,
    });

    assert.ok(saved.fileUrl.startsWith('/uploads/'));
    const relPath = saved.fileUrl.replace('/uploads/', '');
    const savedPath = path.join(process.cwd(), 'public', 'uploads', ...relPath.split('/'));

    try {
      const res = await invokeHandler(relPath);

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');

      const body = Buffer.from(await res.arrayBuffer());
      assert.deepEqual(body, pngHeader);
    } finally {
      await fs.promises.unlink(savedPath).catch(() => {});
    }
  });

  it('serves both legacy flat uploads and nested YYYY/MM/ticketNo uploads', async () => {
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const flatFile = path.join(uploadsDir, 'legacy_flat_proof.png');
    const nestedDir = path.join(uploadsDir, '2026', '11', 'INC-202611-999');
    const nestedFile = path.join(nestedDir, 'nested_proof.png');

    const sampleBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x11, 0x22, 0x33, 0x44]);

    try {
      await fs.promises.mkdir(nestedDir, { recursive: true });
      await fs.promises.writeFile(flatFile, sampleBytes);
      await fs.promises.writeFile(nestedFile, sampleBytes);

      // Legacy flat lookup
      const flatRes = await invokeHandler('legacy_flat_proof.png');
      assert.equal(flatRes.status, 200);
      assert.equal(flatRes.headers.get('content-type'), 'image/png');
      assert.deepEqual(Buffer.from(await flatRes.arrayBuffer()), sampleBytes);

      // Hierarchical nested lookup
      const nestedRes = await invokeHandler('2026/11/INC-202611-999/nested_proof.png');
      assert.equal(nestedRes.status, 200);
      assert.equal(nestedRes.headers.get('content-type'), 'image/png');
      assert.deepEqual(Buffer.from(await nestedRes.arrayBuffer()), sampleBytes);
    } finally {
      await fs.promises.unlink(flatFile).catch(() => {});
      await fs.promises.unlink(nestedFile).catch(() => {});
      await fs.promises.rm(path.join(uploadsDir, '2026'), { recursive: true, force: true }).catch(() => {});
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

    const relPath = saved.fileUrl.replace('/uploads/', '');
    const savedPath = path.join(process.cwd(), 'public', 'uploads', ...relPath.split('/'));

    try {
      const res = await invokeHandler(relPath);

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/octet-stream');
      assert.ok(res.headers.get('content-disposition')?.includes('attachment'));
    } finally {
      await fs.promises.unlink(savedPath).catch(() => {});
    }
  });

  it('returns 404 for missing attachments', async () => {
    const res = await invokeHandler('does-not-exist.png');
    assert.equal(res.status, 404);

    const nestedMissingRes = await invokeHandler('2026/11/INC-202611-999/missing.png');
    assert.equal(nestedMissingRes.status, 404);
  });

  it('blocks path traversal, hidden dotfiles, and invalid segment shapes', async () => {
    const badCases: (string | string[])[] = [
      ['..', '.env'],
      ['2026', '..', '.env'],
      ['2026', '.gitkeep'],
      ['..\\package.json'],
      ['2026', 'a\\b.png'],
      ['2026', 'file\0.png'],
      [''],
      [],
    ];

    for (const bad of badCases) {
      const res = await invokeHandler(bad);
      assert.equal(res.status, 400, `Expected 400 for ${JSON.stringify(bad)}`);
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

    const pdfRel = pdfSaved.fileUrl.replace('/uploads/', '');
    const xlsxRel = xlsxSaved.fileUrl.replace('/uploads/', '');
    const pdfPath = path.join(process.cwd(), 'public', 'uploads', ...pdfRel.split('/'));
    const xlsxPath = path.join(process.cwd(), 'public', 'uploads', ...xlsxRel.split('/'));

    try {
      const pdfRes = await invokeHandler(pdfRel);
      assert.equal(pdfRes.status, 200);
      assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
      assert.equal(pdfRes.headers.get('content-disposition'), null);

      const xlsxRes = await invokeHandler(xlsxRel);
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

  it('creates an atomic SQLite snapshot via VACUUM INTO and prunes backups older than keepDays', async () => {
    const tmpDir = path.join(process.cwd(), 'tests', 'fixtures', `tmp_backup_${Date.now()}`);
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const oldBackupFile = path.join(tmpDir, 'incident_2020-01-01_000000.db');
    const keepTextFile = path.join(tmpDir, 'keep-me.txt');

    try {
      // Plant old backup and non-backup file with mtime 40 days ago
      await fs.promises.writeFile(oldBackupFile, 'OLD_DB');
      await fs.promises.writeFile(keepTextFile, 'STAY');
      const oldTime = (Date.now() - 40 * 86_400_000) / 1000;
      await fs.promises.utimes(oldBackupFile, oldTime, oldTime);
      await fs.promises.utimes(keepTextFile, oldTime, oldTime);

      const res = await backupDatabase({ destDir: tmpDir, keepDays: 30 });

      assert.ok(fs.existsSync(res.backupPath), 'Snapshot file must exist on disk');
      const stat = await fs.promises.stat(res.backupPath);
      assert.ok(stat.size > 0, 'Snapshot must not be empty');

      // Verify valid SQLite 3 file header
      const fd = await fs.promises.open(res.backupPath, 'r');
      const headerBuf = Buffer.alloc(16);
      await fd.read(headerBuf, 0, 16, 0);
      await fd.close();
      assert.equal(headerBuf.toString('utf8', 0, 15), 'SQLite format 3');

      // Verify retention pruning
      assert.equal(res.pruned, 1, 'Should prune exactly 1 old backup');
      assert.equal(fs.existsSync(oldBackupFile), false, 'Old backup file should have been deleted');
      assert.equal(fs.existsSync(keepTextFile), true, 'Unrelated file must not be pruned');
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('serves single-segment filenames from custom UPLOADS_DIR without [filename] shadow route', async () => {
    const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
    await fs.promises.mkdir(fixturesDir, { recursive: true });
    const tmpUploadsDir = await fs.promises.mkdtemp(path.join(fixturesDir, 'tmp_uploads_'));
    const sampleBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xaa, 0xbb, 0xcc, 0xdd]);
    const previousUploadsDir = process.env.UPLOADS_DIR;

    try {
      await fs.promises.writeFile(path.join(tmpUploadsDir, 'custom_flat.png'), sampleBytes);
      process.env.UPLOADS_DIR = tmpUploadsDir;

      const res = await invokeHandler('custom_flat.png');
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
      assert.deepEqual(Buffer.from(await res.arrayBuffer()), sampleBytes);
    } finally {
      if (previousUploadsDir === undefined) {
        delete process.env.UPLOADS_DIR;
      } else {
        process.env.UPLOADS_DIR = previousUploadsDir;
      }
      await fs.promises.rm(tmpUploadsDir, { recursive: true, force: true }).catch(() => {});
    }

    assert.equal(
      fs.existsSync(path.join(process.cwd(), 'src/app/api/uploads/[filename]/route.ts')),
      false
    );
  });
});
