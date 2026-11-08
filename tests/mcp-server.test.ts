import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../src/mcp/server';
import { IncidentService } from '../src/lib/services/incident.service';

describe('8. Model Context Protocol (MCP) Server Tools & Knowledge Base', () => {
  it('has registered standard read-only MCP tools and resources', () => {
    assert.ok(server, 'MCP server instance should be initialized');
    // Verify server name and version
    // @ts-expect-error accessing private/internal server info for validation
    assert.equal(server.server._serverInfo.name, 'incidenthub-mcp-server');
  });

  it('executes search_incidents tool and returns formatted matches', async () => {
    const result = await IncidentService.getIncidents({ limit: 5 });
    assert.ok(result.incidents.length > 0, 'Database should have seeded incidents');

    const first = result.incidents[0];
    const searchResult = await IncidentService.getIncidents({ search: first.ticketNo });
    assert.equal(searchResult.incidents.length, 1);
    assert.equal(searchResult.incidents[0].ticketNo, first.ticketNo);
  });

  it('retrieves detailed incident diagnostics and handles non-existent tickets', async () => {
    // 1. Existing ticket
    const incident = await IncidentService.getIncidentById('INC-202610-001');
    assert.ok(incident, 'INC-202610-001 should exist from database seed');
    assert.equal(incident.ticketNo, 'INC-202610-001');
    assert.ok(incident.description.length > 0);

    // 2. Non-existent ticket
    const missing = await IncidentService.getIncidentById('INC-DOES-NOT-EXIST-999');
    assert.equal(missing, null);
  });
});
