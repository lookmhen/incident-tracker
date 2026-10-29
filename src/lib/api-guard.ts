import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated, extractRequestApiKey } from '@/lib/auth';
import { IntegrationService } from '@/lib/services/integration.service';

/**
 * Shared guard for MCP & External API routes:
 * - Allows authenticated Admin session cookie OR valid x-api-key when enforceApiKey is on.
 * - Optionally checks if MCP master toggle is enabled.
 */
export async function checkApiAccess(
  req: NextRequest,
  options?: { checkMcpEnabled?: boolean }
): Promise<NextResponse | null> {
  const { mcpSecurity } = await IntegrationService.getRawConfig();

  if (options?.checkMcpEnabled && !mcpSecurity.mcpEnabled) {
    return NextResponse.json(
      { error: 'MCP endpoints are currently disabled by administrator in Integrations Hub.' },
      { status: 503 }
    );
  }

  // If Admin is logged in via browser cookie, allow direct inspection
  if (await isAdminAuthenticated(req)) {
    return null;
  }

  // Otherwise check API Key if enforceApiKey is active
  if (mcpSecurity.enforceApiKey) {
    const key = extractRequestApiKey(req);
    if (!key || key !== mcpSecurity.apiKey) {
      return NextResponse.json(
        {
          error: 'Unauthorized. Valid x-api-key or Authorization: Bearer <token> header is required.',
        },
        { status: 401 }
      );
    }
  }

  return null;
}
