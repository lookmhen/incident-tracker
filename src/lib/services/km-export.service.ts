import { McpService } from './mcp.service';

export interface KmArticleMetadata {
  ticketNo: string;
  category: string;
  urgency: string;
  reporterDepartment: string;
  resolvedAt: string | null;
}

export class KmExportService {
  /**
   * Converts an incident into a standardized, AI-friendly Markdown Knowledge Document (RCA Article).
   * Includes YAML frontmatter metadata for vector/metadata filtering in AI RAG engines.
   */
  public static toKnowledgeDocument(incident: {
    ticketNo: string;
    title: string;
    description: string;
    category?: string | null;
    urgency?: string | null;
    department?: string | null;
    resolution?: string | null;
    closedAt?: Date | string | null;
    createdAt?: Date | string | null;
  }): string {
    const cleanTitle = McpService.cleanText(incident.title);
    const cleanDesc = McpService.cleanText(incident.description);
    const cleanRes = incident.resolution ? McpService.cleanText(incident.resolution) : '';

    const resolvedIso = incident.closedAt
      ? (typeof incident.closedAt === 'string' ? new Date(incident.closedAt) : incident.closedAt).toISOString()
      : '';

    return `---
ticket_id: "${incident.ticketNo}"
category: "${incident.category || 'General'}"
urgency: "${incident.urgency || 'MEDIUM'}"
department: "${incident.department || 'General'}"
resolved_at: "${resolvedIso}"
---

# Problem: [${incident.ticketNo}] ${cleanTitle}

## Symptoms & User Description
${cleanDesc || 'No detailed symptoms provided.'}

## Root Cause Analysis & Remediation
${cleanRes || 'Pending resolution documentation.'}
`;
  }

  /**
   * Converts a collection of resolved incidents into a bulk knowledge corpus.
   */
  public static toBatchKnowledgeCorpus(incidents: any[]): Array<{ ticketNo: string; markdown: string }> {
    return incidents.map((inc) => ({
      ticketNo: inc.ticketNo,
      markdown: this.toKnowledgeDocument(inc),
    }));
  }
}
