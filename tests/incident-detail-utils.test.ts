import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normStatus,
  statusPillClass,
  formatDuration,
  formatFileSize,
  attName,
  toLocalDateTimeInput,
  buildMcpPayload,
  appendTextSnippet,
  applyRelatedResolutionCopy,
} from '../src/app/admin/incidents/[id]/_components/utils';
import type { IncidentDetail } from '../src/app/admin/incidents/[id]/_components/types';

describe('Incident Detail Utils', () => {
  describe('normStatus', () => {
    it('trims whitespace and uppercases status strings, handling null/undefined', () => {
      assert.equal(normStatus('  in_progress '), 'IN_PROGRESS');
      assert.equal(normStatus('resolved'), 'RESOLVED');
      assert.equal(normStatus(null), '');
      assert.equal(normStatus(undefined), '');
      assert.equal(normStatus(''), '');
    });
  });

  describe('statusPillClass', () => {
    it('returns emerald classes for RESOLVED and CLOSED', () => {
      assert.equal(statusPillClass('RESOLVED'), 'bg-emerald-50 text-emerald-700 border-emerald-200');
      assert.equal(statusPillClass(' closed '), 'bg-emerald-50 text-emerald-700 border-emerald-200');
    });

    it('returns violet classes for ON_HOLD', () => {
      assert.equal(statusPillClass('ON_HOLD'), 'bg-violet-50 text-violet-700 border-violet-200');
    });

    it('returns indigo classes for PENDING_CONFIRM', () => {
      assert.equal(statusPillClass('PENDING_CONFIRM'), 'bg-indigo-50 text-indigo-700 border-indigo-200');
    });

    it('returns sky classes for OPEN, IN_PROGRESS, REOPENED, and unknown statuses', () => {
      const sky = 'bg-sky-50 text-sky-700 border-sky-200';
      assert.equal(statusPillClass('OPEN'), sky);
      assert.equal(statusPillClass('IN_PROGRESS'), sky);
      assert.equal(statusPillClass('REOPENED'), sky);
      assert.equal(statusPillClass('SOMETHING_ELSE'), sky);
    });
  });

  describe('formatDuration', () => {
    const baseMs = Date.UTC(2026, 10, 23, 10, 0, 0);

    it('handles missing, invalid, and negative durations safely', () => {
      assert.equal(formatDuration('', null, baseMs), '-');
      assert.equal(formatDuration('not-a-date', null, baseMs), '-');
      assert.equal(formatDuration(new Date(baseMs).toISOString(), 'not-a-date', baseMs), '-');
      // Negative duration (end < start) clamps to < 1 minute
      const startIso = new Date(baseMs).toISOString();
      const earlierEndIso = new Date(baseMs - 5 * 60_000).toISOString();
      assert.equal(formatDuration(startIso, earlierEndIso, baseMs), 'น้อยกว่า 1 นาที');
    });

    it('formats < 1m and < 60m using deterministic nowMs when endStr is omitted', () => {
      const startIso = new Date(baseMs).toISOString();
      assert.equal(formatDuration(startIso, null, baseMs + 30_000), 'น้อยกว่า 1 นาที');
      assert.equal(formatDuration(startIso, null, baseMs + 45 * 60_000), '45 นาที');
    });

    it('formats hours and minutes (Xh Ym and exact Xh)', () => {
      const startIso = new Date(baseMs).toISOString();
      const twoHoursIso = new Date(baseMs + 2 * 3600_000).toISOString();
      const twoHoursFifteenIso = new Date(baseMs + (2 * 60 + 15) * 60_000).toISOString();
      assert.equal(formatDuration(startIso, twoHoursIso), '2 ชม.');
      assert.equal(formatDuration(startIso, twoHoursFifteenIso), '2 ชม. 15 นาที');
    });

    it('formats days and hours (Xd Yh and exact Xd)', () => {
      const startIso = new Date(baseMs).toISOString();
      const twoDaysIso = new Date(baseMs + 48 * 3600_000).toISOString();
      const twoDaysThreeHoursIso = new Date(baseMs + 51 * 3600_000).toISOString();
      assert.equal(formatDuration(startIso, twoDaysIso), '2 วัน');
      assert.equal(formatDuration(startIso, twoDaysThreeHoursIso), '2 วัน 3 ชม.');
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes in KB (minimum 1 KB) and MB', () => {
      assert.equal(formatFileSize(100), '1 KB');
      assert.equal(formatFileSize(5120), '5 KB');
      assert.equal(formatFileSize(1024 * 1024), '1.00 MB');
      assert.equal(formatFileSize(2.5 * 1024 * 1024), '2.50 MB');
    });
  });

  describe('attName', () => {
    it('prefers fileName and falls back to fileUrl basename or full fileUrl', () => {
      assert.equal(attName({ fileName: 'error.png', fileUrl: '/uploads/123-error.png' }), 'error.png');
      assert.equal(attName({ fileName: null, fileUrl: '/uploads/123-error.png' }), '123-error.png');
      assert.equal(attName({ fileName: '', fileUrl: '/' }), '/');
    });
  });

  describe('toLocalDateTimeInput', () => {
    it('formats an ISO date into YYYY-MM-DDTHH:mm in local time and handles invalid input', () => {
      const d = new Date(2026, 10, 23, 9, 5, 0);
      assert.equal(toLocalDateTimeInput(d.toISOString()), '2026-11-23T09:05');
      assert.equal(toLocalDateTimeInput('invalid'), '');
    });
  });

  describe('buildMcpPayload', () => {
    const baseIncident: IncidentDetail = {
      id: 'inc-1',
      ticketNo: 'INC-2026-0001',
      title: 'VPN down',
      description: 'Cannot connect',
      reporterName: 'Alice',
      department: 'IT',
      contactInfo: '1234',
      urgency: 'HIGH',
      category: null,
      categoryId: null,
      rootCause: 'System',
      status: 'IN_PROGRESS',
      assignedTo: 'admin',
      resolution: null,
      createdAt: '2026-11-23T00:00:00.000Z',
      updatedAt: '2026-11-23T00:00:00.000Z',
      closedAt: null,
      attachments: [],
    };

    it('builds MCP payload with General fallback category, urgency, and resolution text', () => {
      const payload = buildMcpPayload(baseIncident, 'Restarted VPN gateway');
      assert.deepEqual(payload, {
        mcp_resource_uri: 'mcp://incidenthub/incidents/INC-2026-0001',
        ticketNo: 'INC-2026-0001',
        category: 'General',
        urgency: 'HIGH',
        status: 'IN_PROGRESS',
        clean_text_corpus: 'Restarted VPN gateway',
      });
    });

    it('preserves explicit category when present', () => {
      const payload = buildMcpPayload({ ...baseIncident, category: 'Network' }, 'Fixed');
      assert.equal(payload.category, 'Network');
      assert.equal(payload.clean_text_corpus, 'Fixed');
    });
  });

  describe('appendTextSnippet', () => {
    it('sets trimmed snippet when current is empty and appends with newline when non-empty', () => {
      assert.equal(appendTextSnippet('', '  Restart service  '), 'Restart service');
      assert.equal(appendTextSnippet('Step 1  \n', 'Step 2'), 'Step 1\nStep 2');
      assert.equal(appendTextSnippet('Existing', '   '), 'Existing');
    });
  });

  describe('applyRelatedResolutionCopy', () => {
    it('copies resolution only without overwriting existing resolutionType when source is not WORKAROUND', () => {
      const res = applyRelatedResolutionCopy(
        { resolutionText: '', resolutionType: 'PERMANENT', workaroundNote: '' },
        { resolution: 'Cleared cache', resolutionType: 'PERMANENT', workaroundNote: null }
      );
      assert.deepEqual(res, {
        resolutionText: 'Cleared cache',
        resolutionType: 'PERMANENT',
        workaroundNote: '',
        copiedResolution: true,
        copiedWorkaround: false,
      });
    });

    it('copies both resolution and workaround note and switches resolutionType to WORKAROUND', () => {
      const res = applyRelatedResolutionCopy(
        { resolutionText: 'Initial check', resolutionType: 'PERMANENT', workaroundNote: '' },
        {
          resolution: 'Restarted worker',
          resolutionType: 'WORKAROUND',
          workaroundNote: 'Monitor queue every 2 hours',
        }
      );
      assert.deepEqual(res, {
        resolutionText: 'Initial check\nRestarted worker',
        resolutionType: 'WORKAROUND',
        workaroundNote: 'Monitor queue every 2 hours',
        copiedResolution: true,
        copiedWorkaround: true,
      });
    });

    it('appends workaround note when source has workaroundNote even if resolution is empty', () => {
      const res = applyRelatedResolutionCopy(
        { resolutionText: '', resolutionType: 'WORKAROUND', workaroundNote: 'Note 1' },
        { resolution: null, resolutionType: 'WORKAROUND', workaroundNote: 'Note 2' }
      );
      assert.deepEqual(res, {
        resolutionText: '',
        resolutionType: 'WORKAROUND',
        workaroundNote: 'Note 1\nNote 2',
        copiedResolution: false,
        copiedWorkaround: true,
      });
    });
  });
});
