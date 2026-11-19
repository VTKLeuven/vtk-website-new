import { AUTH_BASE_PATH, MCP_SCOPES } from "@vtk/auth";

export function getMcpBaseUrl(request?: Request): string | null {
  for (const candidate of [process.env.BETTER_AUTH_URL, process.env.VTK_MAIN_URL]) {
    if (!candidate) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      // Ongeldige basis-URL: val terug op volgende kandidaat.
    }
  }
  if (request) {
    try {
      return new URL(request.url).origin;
    } catch {
      return null;
    }
  }
  return null;
}

export function getMcpResourceMetadataUrl(request?: Request): string | null {
  const base = getMcpBaseUrl(request);
  return base ? `${base}/.well-known/oauth-protected-resource/api/mcp` : null;
}

export function protectedResourceMetadataResponse(request: Request): Response {
  const base = getMcpBaseUrl(request);
  if (!base) {
    return Response.json({ error: "MCP_BASE_URL_NOT_CONFIGURED" }, { status: 500 });
  }
  return Response.json(
    {
      resource: `${base}/api/mcp`,
      authorization_servers: [`${base}${AUTH_BASE_PATH}`],
      scopes_supported: [...MCP_SCOPES],
      bearer_methods_supported: ["header"],
    },
    {
      headers: {
        "cache-control": "public, max-age=300",
      },
    },
  );
}
