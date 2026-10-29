import { NextRequest, NextResponse } from 'next/server';
import { McpService } from '@/lib/services/mcp.service';
import { checkApiAccess } from '@/lib/api-guard';

export async function GET(req: NextRequest) {
  const denied = await checkApiAccess(req, { checkMcpEnabled: true });
  if (denied) return denied;

  try {
    const insights = await McpService.getInsights();
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...insights,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
