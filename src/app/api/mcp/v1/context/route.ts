import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/services/incident.service';
import { McpService } from '@/lib/services/mcp.service';
import { checkApiAccess } from '@/lib/api-guard';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const denied = await checkApiAccess(req, { checkMcpEnabled: true });
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const ticketNo = searchParams.get('ticketNo');

    if (ticketNo) {
      const incident = await IncidentService.getIncidentById(ticketNo);
      if (!incident) {
        return NextResponse.json({ error: `Incident ${ticketNo} not found` }, { status: 404 });
      }
      return NextResponse.json(McpService.formatMcpContext(incident));
    }

    // If no specific ticket requested, return the corpus of resolved incidents for model ingestion
    const incidents = await prisma.incident.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { attachments: true },
    });

    const dataset = incidents.map((inc) => McpService.formatMcpContext(inc));

    return NextResponse.json({
      mcp_protocol_version: '2024.11',
      schema: 'mcp.incident.v1',
      total_records: dataset.length,
      incidents: dataset,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
