import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated, extractRequestApiKey } from '@/lib/auth';
import { IntegrationService } from '@/lib/services/integration.service';

/**
 * Shared guard for MCP & External API routes:
 * - Allows authenticated Admin session cookie OR valid x-api-key when enforceApiKey is on.
 * - Optionally checks if MCP master toggle is enabled.
 * - When requireAuth is true: ALWAYS requires either an active Admin session or valid API key.
 */
export async function checkApiAccess(
  req: NextRequest,
  options?: { checkMcpEnabled?: boolean; requireAuth?: boolean }
): Promise<NextResponse | null> {
  const { mcpSecurity } = await IntegrationService.getRawConfig();

  if (options?.checkMcpEnabled && !mcpSecurity.mcpEnabled) {
    return NextResponse.json(
      { error: 'MCP endpoints are currently disabled by administrator in Integrations Hub.' },
      { status: 503 }
    );
  }

  // 1. If Admin is logged in via browser cookie, allow access
  if (await isAdminAuthenticated(req)) {
    return null;
  }

  // 2. Check API Key
  const key = extractRequestApiKey(req);
  const hasValidKey = Boolean(key && mcpSecurity.apiKey && key === mcpSecurity.apiKey);

  if (hasValidKey) {
    return null;
  }

  // 3. Reject if requireAuth is set OR if enforceApiKey is turned on in Integrations
  if (options?.requireAuth || mcpSecurity.enforceApiKey) {
    return NextResponse.json(
      {
        error: 'Unauthorized. Valid Admin session or x-api-key / Bearer token is required.',
      },
      { status: 401 }
    );
  }

  return null;
}
