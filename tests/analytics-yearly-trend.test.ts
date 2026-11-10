import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvContent, parseThaiDate } from '../src/lib/csv-parser';
import { IncidentService } from '../src/lib/services/incident.service';

describe('10. CSV Parser & Yearly Monthly Trend Analytics', () => {
  it('parses CSV content with internal quotes and multiline rows properly', () => {
    const rawCsv = `"ID","Detail","Date"\n"1","Single line detail","10/8/2569"\n"2","Line one\nLine two with ""quotes""","11/8/2569 15:30"`;
    const rows = parseCsvContent(rawCsv);

    assert.equal(rows.length, 3);
    assert.equal(rows[0][0], 'ID');
    assert.equal(rows[1][1], 'Single line detail');
    assert.ok(rows[2][1].includes('Line two with "quotes"'));
  });

  it('converts Buddhist Era (BE) dates and times to UTC Gregorian correctly', () => {
    // 10 August 2569 BE -> 10 August 2026 AD
    const parsedDate = parseThaiDate('10/8/2569');
    assert.ok(parsedDate);
    assert.equal(parsedDate.getUTCFullYear(), 2026);
    assert.equal(parsedDate.getUTCMonth(), 7); // 0-indexed: 7 is August
    assert.equal(parsedDate.getUTCDate(), 10);

    // With time: 10/8/2569 16:54
    const parsedWithTime = parseThaiDate('10/8/2569 16:54');
    assert.ok(parsedWithTime);
    assert.equal(parsedWithTime.getUTCHours(), 16);
    assert.equal(parsedWithTime.getUTCMinutes(), 54);

    // ISO format: 2026-10-15
    const parsedIso = parseThaiDate('2026-10-15 08:30');
    assert.ok(parsedIso);
    assert.equal(parsedIso.getUTCFullYear(), 2026);
    assert.equal(parsedIso.getUTCMonth(), 9); // October
    assert.equal(parsedIso.getUTCDate(), 15);
    assert.equal(parsedIso.getUTCHours(), 8);
  });

  it('computes 12-month full-year trend with zero-filled empty months', async () => {
    const data = await IncidentService.getAnalyticsData({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      groupBy: 'month',
    });

    assert.equal(data.groupBy, 'month');
    assert.equal(data.trend.length, 12, 'Full year must return all 12 calendar months');
    assert.equal(data.trend[0].date, '2026-01');
    assert.equal(data.trend[0].label, 'ม.ค.');
    assert.equal(data.trend[11].date, '2026-12');
    assert.equal(data.trend[11].label, 'ธ.ค.');

    // We know August (2026-08) has imported data from Incident Report.csv
    const aug = data.trend.find((t) => t.date === '2026-08');
    assert.ok(aug && aug.total > 0, 'August 2026 should contain imported incidents');
  });
});
