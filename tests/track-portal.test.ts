import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import prisma from '../src/lib/prisma';
import { IncidentService } from '../src/lib/services/incident.service';
import { GET as trackGetHandler } from '../src/app/api/track/[id]/route';
import { getPublicTrackStage } from '../src/lib/track-status';

describe('15. Public Tracking Portal Status & Sanitization', () => {
  const createdIds: string[] = [];

  after(async () => {
    if (createdIds.length > 0) {
      await prisma.incident.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it('maps PENDING_CONFIRM, RESOLVED, CLOSED to completed Step 3 and keeps ON_HOLD/IN_PROGRESS at Step 2', () => {
    assert.deepEqual(getPublicTrackStage('OPEN'), {
      isCompletedForUser: false,
      isInProgress: false,
      progressWidth: '0%',
      step2Note: '',
    });

    assert.deepEqual(getPublicTrackStage('IN_PROGRESS'), {
      isCompletedForUser: false,
      isInProgress: true,
      progressWidth: '50%',
      step2Note: '',
    });

    assert.deepEqual(getPublicTrackStage('ON_HOLD'), {
      isCompletedForUser: false,
      isInProgress: true,
      progressWidth: '50%',
      step2Note: 'รอข้อมูลเพิ่มเติม',
    });

    for (const status of ['PENDING_CONFIRM', ' pending_confirm ', 'RESOLVED', 'CLOSED']) {
      assert.deepEqual(getPublicTrackStage(status), {
        isCompletedForUser: true,
        isInProgress: false,
        progressWidth: '100%',
        step2Note: '',
      });
    }
  });

  it('returns no-store headers, Uncategorized fallback, resolution notes for PENDING_CONFIRM, and omits internal fields', async () => {
    const inc = await IncidentService.createIncident({
      reporterName: 'Track Portal User',
      department: 'Finance',
      contactInfo: 'ext-1234',
      title: 'SAP Login Issue',
      description: 'Cannot access SAP GUI',
      urgency: 'MEDIUM',
    });
    createdIds.push(inc.id);

    await prisma.incident.update({
      where: { id: inc.id },
      data: {
        status: 'PENDING_CONFIRM',
        assignedTo: 'IT Staff A',
        resolution: 'Reset user lock in SU01',
        resolutionType: 'WORKAROUND',
        workaroundNote: 'Change password on first login',
        managerComment: 'Internal manager note',
      },
    });

    const req = new NextRequest(`http://localhost:3000/api/track/${inc.ticketNo}`);
    const res = await trackGetHandler(req, { params: Promise.resolve({ id: inc.ticketNo }) });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control') || '', /no-store/);

    const body = await res.json();
    assert.equal(body.status, 'PENDING_CONFIRM');
    assert.equal(body.category, 'Uncategorized');
    assert.equal(body.resolution, 'Reset user lock in SU01');
    assert.equal(body.resolutionType, 'WORKAROUND');
    assert.equal(body.workaroundNote, 'Change password on first login');
    assert.equal('managerComment' in body, false);
    assert.equal('contactInfo' in body, false);
    assert.equal('assignedTo' in body, false);
  });
});
