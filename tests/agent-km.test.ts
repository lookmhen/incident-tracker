import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { KmExportService } from '../src/lib/services/km-export.service';
import { IntegrationService } from '../src/lib/services/integration.service';
import { GET as kmGetHandler } from '../src/app/api/mcp/v1/km/route';
import { GET as contextGetHandler } from '../src/app/api/mcp/v1/context/route';
import { ADMIN_COOKIE_NAME, createAdminSessionToken } from '../src/lib/auth';
import { server } from '../src/mcp/server';

describe('9. Agent KM Export & Knowledge Ingestion Pipeline', () => {
  before(async () => {
    await IntegrationService.saveMcpSecurityConfig({ mcpEnabled: true });
  });
  it('converts an incident into clean Markdown Knowledge Article with YAML frontmatter', () => {
    const sampleIncident = {
      ticketNo: 'INC-202610-999',
      title: '<b>SAP S/4HANA GUI Timeout During Batch Run</b>',
      description: 'Program terminated with RFC_COMMUNICATION_FAILURE dump. User cannot proceed.',
      category: 'SAP Basis',
      urgency: 'HIGH',
      department: 'Finance',
      resolution: '<p>Restarted background dialog workprocess and cleared SM59 buffer.</p>',
      closedAt: new Date('2026-10-29T10:00:00Z'),
    };

    const doc = KmExportService.toKnowledgeDocument(sampleIncident);

    // Frontmatter validations
    assert.ok(doc.startsWith('---'));
    assert.ok(doc.includes('ticket_id: "INC-202610-999"'));
    assert.ok(doc.includes('category: "SAP Basis"'));
    assert.ok(doc.includes('urgency: "HIGH"'));
    assert.ok(doc.includes('department: "Finance"'));
    assert.ok(doc.includes('resolved_at: "2026-10-29T10:00:00.000Z"'));

    // Content validations
    assert.ok(doc.includes('# Problem: [INC-202610-999] SAP S/4HANA GUI Timeout During Batch Run'));
    assert.ok(!doc.includes('<b>'), 'HTML tags must be stripped');
    assert.ok(!doc.includes('<p>'), 'HTML tags must be stripped');
    assert.ok(doc.includes('Restarted background dialog workprocess and cleared SM59 buffer.'));
  });

  it('handles missing resolution and unassigned department gracefully', () => {
    const uncompletedIncident = {
      ticketNo: 'INC-202610-888',
      title: 'VPN Core Gateway Session Drop',
      description: 'Connection lost repeatedly every 5 minutes.',
      category: 'Network',
      urgency: 'MEDIUM',
    };

    const doc = KmExportService.toKnowledgeDocument(uncompletedIncident);

    assert.ok(doc.includes('ticket_id: "INC-202610-888"'));
    assert.ok(doc.includes('department: "General"'));
    assert.ok(doc.includes('resolved_at: ""'));
    assert.ok(doc.includes('Pending resolution documentation.'));
  });

  it('generates bulk knowledge corpus via toBatchKnowledgeCorpus', () => {
    const batch = [
      { ticketNo: 'INC-001', title: 'Issue 1', description: 'Desc 1', resolution: 'Fix 1' },
      { ticketNo: 'INC-002', title: 'Issue 2', description: 'Desc 2', resolution: 'Fix 2' },
    ];

    const corpus = KmExportService.toBatchKnowledgeCorpus(batch);
    assert.equal(corpus.length, 2);
    assert.equal(corpus[0].ticketNo, 'INC-001');
    assert.ok(corpus[0].markdown.includes('ticket_id: "INC-001"'));
    assert.equal(corpus[1].ticketNo, 'INC-002');
  });

  it('enforces authentication on GET /api/mcp/v1/km and returns markdown for Admin', async () => {
    // 1. Unauthenticated request without key or cookie -> 401
    const unauthReq = new NextRequest('http://localhost:3000/api/mcp/v1/km?ticketNo=INC-NON-EXISTENT');
    const unauthRes = await kmGetHandler(unauthReq);
    assert.equal(unauthRes.status, 401);

    // 2. Admin session request -> 200 with text/markdown
    const adminToken = await createAdminSessionToken();
    const adminReq = new NextRequest('http://localhost:3000/api/mcp/v1/km?ticketNo=INC-202608-0129', {
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    const adminRes = await kmGetHandler(adminReq);
    assert.equal(adminRes.status, 200);
    assert.ok(adminRes.headers.get('content-type')?.includes('text/markdown'));
    const markdown = await adminRes.text();
    assert.ok(markdown.includes('ticket_id: "INC-202608-0129"'));

    // 3. Bulk request in JSON format
    const bulkReq = new NextRequest('http://localhost:3000/api/mcp/v1/km', {
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    const bulkRes = await kmGetHandler(bulkReq);
    assert.equal(bulkRes.status, 200);
    const bulkJson = await bulkRes.json();
    assert.equal(bulkJson.schema, 'incidenthub.km.v1');
    assert.ok(Array.isArray(bulkJson.articles));

    // 4. Backward-compatible /api/mcp/v1/context forwards cleanly
    const contextReq = new NextRequest('http://localhost:3000/api/mcp/v1/context?ticketNo=INC-202608-0129', {
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    });
    const contextRes = await contextGetHandler(contextReq);
    assert.equal(contextRes.status, 200);
    const contextJson = await contextRes.json();
    assert.equal(contextJson.ticketNo, 'INC-202608-0129');
    assert.ok(contextJson.markdown);
  });

  it('has registered export_km_article tool in MCP Server', () => {
    assert.ok(server, 'MCP server instance should be initialized');
    // Verify server name and version
    // @ts-expect-error accessing private/internal server info for validation
    assert.equal(server.server._serverInfo.name, 'incidenthub-mcp-server');
  });
});
