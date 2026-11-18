import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { IncidentService } from '@/lib/services/incident.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const groupBy = (searchParams.get('groupBy') as 'auto' | 'day' | 'month') || undefined;
    const urgency = searchParams.get('urgency') || undefined;
    const category = searchParams.get('category') || undefined;
    const department = searchParams.get('department') || undefined;

    const data = await IncidentService.getAnalyticsData({
      startDate,
      endDate,
      groupBy,
      urgency,
      category,
      department,
    });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to compute analytics' }, { status: 500 });
  }
}
