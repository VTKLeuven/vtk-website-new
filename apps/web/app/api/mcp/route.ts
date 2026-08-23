import {
  authenticateMcpRequest,
  boundedMcpRequest,
  enforceMcpRateLimit,
  withMcpResponseHeaders,
} from "@/lib/mcp/auth";
import { mcpHandler } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const authentication = await authenticateMcpRequest(request);
  if (authentication instanceof Response) return authentication;

  const limited = enforceMcpRateLimit(authentication.rateLimitKey);
  if (limited) return limited;

  const bounded = await boundedMcpRequest(request);
  if (bounded instanceof Response) return bounded;

  const response = await mcpHandler.fetch(bounded, { authInfo: authentication.authInfo });
  return withMcpResponseHeaders(response);
}
