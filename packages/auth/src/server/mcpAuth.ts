import 'server-only';

import { prisma } from '@vtk/db';
import { verifyJwsAccessToken } from 'better-auth/oauth2';
import { auth } from '../auth';
import { resolveMcpUserAuthz, type McpUserAuthz } from './session';

export type VerifiedMcpOAuthToken = {
  userId: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  user: McpUserAuthz;
};

export type VerifyMcpAccessTokenResult =
  | { status: 'ok'; data: VerifiedMcpOAuthToken }
  | { status: 'invalid_token' }
  | { status: 'forbidden'; error: string; scope?: string };

export async function verifyMcpAccessToken(
  token: string,
  expectedAudience: string,
): Promise<VerifyMcpAccessTokenResult> {
  const ctx = await auth.$context;
  const issuer = ctx.baseURL;

  let payload: Record<string, unknown>;
  try {
    payload = await verifyJwsAccessToken(token, {
      jwksFetch: () => auth.api.getJwks(),
      jwksCacheKey: auth,
      verifyOptions: {
        audience: expectedAudience,
        issuer,
      },
    });
  } catch {
    return { status: 'invalid_token' };
  }

  const userId = typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  const clientId =
    typeof payload.client_id === 'string' && payload.client_id.length > 0
      ? payload.client_id
      : typeof payload.azp === 'string' && payload.azp.length > 0
        ? payload.azp
        : null;
  if (!userId || !clientId) {
    return { status: 'invalid_token' };
  }

  const scopes =
    typeof payload.scope === 'string'
      ? payload.scope
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  if (!scopes.includes('mcp:read')) {
    return { status: 'forbidden', error: 'insufficient_scope', scope: 'mcp:read' };
  }

  const [user, client] = await Promise.all([
    resolveMcpUserAuthz(userId),
    prisma.oauthClient.findUnique({ where: { clientId }, select: { name: true, disabled: true } }),
  ]);

  if (!user || !user.hasMcpUse || !client || client.disabled) {
    return { status: 'forbidden', error: 'MCP_FORBIDDEN' };
  }

  return {
    status: 'ok',
    data: {
      userId,
      clientId,
      clientName: client?.name || clientId,
      scopes,
      user,
    },
  };
}
