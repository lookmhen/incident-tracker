import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/services/incident.service';
import { KmExportService } from '@/lib/services/km-export.service';
import { checkApiAccess } from '@/lib/api-guard';
import prisma from '@/lib/prisma';

/**
 * GET /api/mcp/v1/km
 * Exports clean Markdown Knowledge Articles for Agent RAG and Vector DB ingestion.
 * Query params:
 *   - ticketNo: (optional) Fetch single ticket as Markdown
 *   - format: 'markdown' (default) or 'json'
 */
export async function GET(req: NextRequest) {
  const denied = await checkApiAccess(req, { checkMcpEnabled: true, requireAuth: true });
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const ticketNo = searchParams.get('ticketNo');
    const format = searchParams.get('format') || 'markdown';

    if (ticketNo) {
      const incident = await IncidentService.getIncidentById(ticketNo);
      if (!incident) {
        return NextResponse.json({ error: `Incident ${ticketNo} not found` }, { status: 404 });
      }

      const markdown = KmExportService.toKnowledgeDocument(incident);

      if (format === 'json') {
        return NextResponse.json({
          ticketNo: incident.ticketNo,
          category: incident.category || 'General',
          urgency: incident.urgency,
          status: incident.status,
          markdown,
        });
      }

      return new NextResponse(markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `inline; filename="${incident.ticketNo}-km.md"`,
        },
      });
    }

    // Bulk export of resolved knowledge articles
    const resolved = await prisma.incident.findMany({
      where: { status: { in: ['RESOLVED', 'CLOSED'] } },
      orderBy: { closedAt: 'desc' },
      take: 100,
    });

    const articles = KmExportService.toBatchKnowledgeCorpus(resolved);

    return NextResponse.json({
      schema: 'incidenthub.km.v1',
      total_articles: articles.length,
      articles,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
