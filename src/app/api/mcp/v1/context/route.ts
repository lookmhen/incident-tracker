import { NextRequest } from 'next/server';
import { GET as kmHandler } from '../km/route';

/**
 * GET /api/mcp/v1/context
 * Unified alias forwarding to /api/mcp/v1/km?format=json.
 * Preserves backward compatibility for external MCP clients and scripts.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!url.searchParams.has('format')) {
    url.searchParams.set('format', 'json');
  }
  const forwardedReq = new NextRequest(url.toString(), req);
  return kmHandler(forwardedReq);
}
