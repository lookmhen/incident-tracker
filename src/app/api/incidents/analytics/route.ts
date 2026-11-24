import { NextRequest, NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/session';
import { IncidentAnalyticsService } from '@/lib/services/incident-analytics.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!(await getActiveSession(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const rawGroupBy = searchParams.get('groupBy');
    const groupBy =
      rawGroupBy === 'auto' || rawGroupBy === 'day' || rawGroupBy === 'month' || rawGroupBy === 'year'
        ? rawGroupBy
        : undefined;
    const urgency = searchParams.get('urgency') || undefined;
    const category = searchParams.get('category') || undefined;
    const rootCause = searchParams.get('rootCause') || undefined;
    const department = searchParams.get('department') || undefined;
    const resolvedByExternal = searchParams.get('resolvedByExternal') || undefined;

    const data = await IncidentAnalyticsService.getAnalyticsData({
      startDate,
      endDate,
      groupBy,
      urgency,
      category,
      rootCause,
      department,
      resolvedByExternal,
    });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to compute analytics' }, { status: 500 });
  }
}
