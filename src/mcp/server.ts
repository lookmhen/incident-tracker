#!/usr/bin/env node
/**
 * IncidentHub - Model Context Protocol (MCP) Server
 * Standardized read-only bridge connecting AI Clients (Claude Desktop, Cursor, Antigravity)
 * to enterprise IT Incident database and RCA knowledge corpus.
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { IncidentService } from '../lib/services/incident.service';
import { McpService } from '../lib/services/mcp.service';
import { KmExportService } from '../lib/services/km-export.service';

export const server = new McpServer({
  name: 'incidenthub-mcp-server',
  version: '1.0.0',
});

/**
 * Tool 1: search_incidents
 * Search historical IT incidents and resolutions by keyword, category, urgency, or status.
 */
server.tool(
  'search_incidents',
  'Search historical IT incidents by keywords, category, urgency, or status. Returns matching incidents with resolution summaries when available.',
  {
    query: z.string().optional().describe('Keyword to search in title, description, ticket number, or reporter name'),
    category: z.string().optional().describe('Filter by category (e.g. SAP Basis, Network, Interface, Helpdesk)'),
    urgency: z.enum(['HIGH', 'MEDIUM', 'LOW', 'ALL']).optional().describe('Filter by urgency level'),
    status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ALL']).optional().describe('Filter by ticket status'),
    limit: z.number().min(1).max(50).default(10).describe('Maximum number of records to return (default 10)'),
  },
  async ({ query, category, urgency, status, limit }) => {
    const result = await IncidentService.getIncidents({
      search: query,
      category: category === 'ALL' ? undefined : category,
      urgency: urgency === 'ALL' ? undefined : urgency,
      status: status === 'ALL' ? undefined : status,
      limit,
    });

    const items = result.incidents.map((inc) => ({
      ticketNo: inc.ticketNo,
      title: inc.title,
      category: inc.category || 'General',
      urgency: inc.urgency,
      status: inc.status,
      reporter: `${inc.reporterName} (${inc.department || 'General'})`,
      createdAt: inc.createdAt.toISOString(),
      hasResolution: Boolean(inc.resolution),
      resolutionSnippet: inc.resolution
        ? inc.resolution.slice(0, 160) + (inc.resolution.length > 160 ? '...' : '')
        : null,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              totalMatches: result.pagination.total,
              returned: items.length,
              incidents: items,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

/**
 * Tool 2: get_incident_detail
 * Get full diagnostic context, description, error dump metadata, and sanitized root-cause notes.
 */
server.tool(
  'get_incident_detail',
  'Retrieve full diagnostic context, description, error dump metadata, and sanitized root-cause resolution notes for a specific incident ticket.',
  {
    ticketNo: z.string().describe('The ticket number (e.g., "INC-202610-001") or internal database ID'),
  },
  async ({ ticketNo }) => {
    const incident = await IncidentService.getIncidentById(ticketNo);
    if (!incident) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Incident with ticket number "${ticketNo}" was not found.` }],
      };
    }

    const formatted = McpService.formatMcpContext(incident);
    const detailPayload = {
      ...formatted,
      reporterName: incident.reporterName,
      contactInfo: incident.contactInfo,
      assignedTo: incident.assignedTo || 'Unassigned',
      rawTitle: incident.title,
      rawDescription: incident.description,
      attachments: incident.attachments.map((att: any) => ({
        fileName: att.fileName,
        fileType: att.fileType,
        fileSizeFormatted: `${(att.fileSize / 1024).toFixed(0)} KB`,
      })),
      webConsoleUrl: `/admin/incidents/${incident.ticketNo}`,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(detailPayload, null, 2),
        },
      ],
    };
  }
);

/**
 * Tool 3: get_knowledge_insights
 * Retrieve operational KPI telemetry, category volume, and recurring issue clusters/bottlenecks.
 */
server.tool(
  'get_knowledge_insights',
  'Retrieve operational KPI telemetry, resolution rates, category volume distribution, and recurring issue clusters/bottlenecks across the incident database.',
  {},
  async () => {
    const [insights, recurring] = await Promise.all([
      McpService.getInsights(),
      McpService.detectRecurringCases(),
    ]);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              telemetry: insights.overview,
              categoryLoad: insights.categoryLoad,
              statusDistribution: insights.statusDistribution,
              kpiBaseline: insights.kpiBaseline,
              recurringIssueClusters: recurring,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

/**
 * Tool 4: export_km_article
 * Export an incident as a clean, standardized Markdown Knowledge Management (KM) article.
 * Perfect for ingestion into Hermes RAG or vector database.
 */
server.tool(
  'export_km_article',
  'Export an incident as a standardized, clean Markdown Knowledge Base article with YAML frontmatter metadata, symptoms, and root cause analysis.',
  {
    ticketNo: z.string().describe('The ticket number (e.g., "INC-202610-001") or internal database ID'),
  },
  async ({ ticketNo }) => {
    const incident = await IncidentService.getIncidentById(ticketNo);
    if (!incident) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Incident with ticket number "${ticketNo}" was not found.` }],
      };
    }

    const markdownDoc = KmExportService.toKnowledgeDocument(incident);
    return {
      content: [
        {
          type: 'text',
          text: markdownDoc,
        },
      ],
    };
  }
);

/**
 * Resource 1: Single Incident Context URI
 */
server.resource(
  'incident-context',
  new ResourceTemplate('incidenthub://incidents/{ticketNo}', { list: undefined }),
  async (uri, { ticketNo }) => {
    const ticketId = Array.isArray(ticketNo) ? ticketNo[0] : ticketNo;
    const incident = await IncidentService.getIncidentById(ticketId);
    if (!incident) {
      throw new Error(`Incident ${ticketId} not found`);
    }
    const context = McpService.formatMcpContext(incident);
    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(context, null, 2),
          mimeType: 'application/json',
        },
      ],
    };
  }
);

/**
 * Resource 2: Knowledge Base Corpus (Resolved Incidents in JSON format)
 */
server.resource('resolved-corpus', 'incidenthub://kb/resolved', async (uri) => {
  const resolved = await prisma.incident.findMany({
    where: { status: { in: ['RESOLVED', 'CLOSED'] } },
    orderBy: { closedAt: 'desc' },
    take: 50,
    include: { attachments: true },
  });

  const corpus = resolved.map((inc) => McpService.formatMcpContext(inc));
  return {
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify({ count: corpus.length, corpus }, null, 2),
        mimeType: 'application/json',
      },
    ],
  };
});

/**
 * Resource 3: Single Incident KM Markdown Article
 */
server.resource(
  'incident-km-article',
  new ResourceTemplate('incidenthub://km/articles/{ticketNo}', { list: undefined }),
  async (uri, { ticketNo }) => {
    const ticketId = Array.isArray(ticketNo) ? ticketNo[0] : ticketNo;
    const incident = await IncidentService.getIncidentById(ticketId);
    if (!incident) {
      throw new Error(`Incident ${ticketId} not found`);
    }
    const markdown = KmExportService.toKnowledgeDocument(incident);
    return {
      contents: [
        {
          uri: uri.href,
          text: markdown,
          mimeType: 'text/markdown',
        },
      ],
    };
  }
);

/**
 * Resource 4: Bulk KM Markdown Corpus (For RAG vector indexing)
 */
server.resource('km-markdown-corpus', 'incidenthub://km/corpus', async (uri) => {
  const resolved = await prisma.incident.findMany({
    where: { status: { in: ['RESOLVED', 'CLOSED'] } },
    orderBy: { closedAt: 'desc' },
    take: 100,
  });

  const corpus = KmExportService.toBatchKnowledgeCorpus(resolved);
  return {
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify({ total: corpus.length, articles: corpus }, null, 2),
        mimeType: 'application/json',
      },
    ],
  };
});

// Run server when executed directly as CLI script
if (require.main === module || process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    console.error('[IncidentHub MCP Server] Fatal startup error:', err);
    process.exit(1);
  });
}
