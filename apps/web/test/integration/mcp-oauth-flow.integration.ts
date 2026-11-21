import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeJwt } from 'jose';
import { prisma } from '@vtk/db';
import { AUTH_BASE_PATH, currentWorkingYear } from '@vtk/auth';
import { hashPassword } from '@vtk/auth/server';
import { POST as mcpPost } from '@/app/api/mcp/route';
import { auth } from '../../../../packages/auth/src/auth';

function base64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function parseMcpJsonRpc(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();
  if (contentType.includes('text/event-stream')) {
    const dataLine = text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('data: '));
    if (!dataLine) {
      throw new Error(`Expected SSE data line in MCP response, got: ${text}`);
    }
    return JSON.parse(dataLine.slice('data: '.length)) as Record<string, unknown>;
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * End-to-end OAuth 2.1 + PKCE + RFC 8707 flow door Better Auth en `/api/mcp`
 * tegen echte Postgres, zonder zelf-ondertekende JWT's.
 */
describe('MCP OAuth 2.1 end-to-end flow', () => {
  const suffix = randomUUID().slice(0, 8);
  const year = currentWorkingYear();
  const origin = new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').origin;
  const resourceUrl = `${origin}/api/mcp`;
  const redirectUri = 'https://claude.ai/api/mcp/auth_callback';
  const password = `vtk-mcp-test-${suffix}-secret`;

  const ids = {
    user: randomUUID(),
    account: randomUUID(),
    role: randomUUID(),
    group: randomUUID(),
  };

  let createdResourceId: string | null = null;
  const createdPermissionIds: string[] = [];
  let registeredClientId: string | null = null;
  let sessionCookie = '';

  async function ensurePermission(code: string) {
    const existing = await prisma.permission.findUnique({ where: { code } });
    if (existing) return existing.id;
    const created = await prisma.permission.create({
      data: { code, labelNl: code, labelEn: code, category: 'test' },
    });
    createdPermissionIds.push(created.id);
    return created.id;
  }

  beforeAll(async () => {
    const existingResource = await prisma.oauthResource.findUnique({
      where: { identifier: resourceUrl },
    });
    if (!existingResource) {
      const now = new Date();
      const created = await prisma.oauthResource.create({
        data: {
          id: randomUUID(),
          identifier: resourceUrl,
          name: 'VTK MCP Server',
          allowedScopes: ['mcp:read', 'mcp:create', 'offline_access'],
          disabled: false,
          createdAt: now,
          updatedAt: now,
        },
      });
      createdResourceId = created.id;
    }

    const mcpUsePermId = await ensurePermission('mcp.use');
    const calendarCreatePermId = await ensurePermission('calendar.create');
    const usersViewPermId = await ensurePermission('users.view');

    const email = `mcp-flow-${suffix}@student.kuleuven.be`;
    const passwordHash = await hashPassword(password);

    await prisma.user.create({
      data: {
        id: ids.user,
        name: 'MCP Flow Tester',
        email,
        emailVerified: true,
        active: true,
      },
    });
    await prisma.account.create({
      data: {
        id: ids.account,
        accountId: ids.user,
        providerId: 'credential',
        userId: ids.user,
        password: passwordHash,
      },
    });

    await prisma.group.create({
      data: {
        id: ids.group,
        code: `MCP-${suffix}`,
        slug: `mcp-${suffix}`,
        nameNl: 'MCP Test',
        nameEn: 'MCP Test',
      },
    });
    await prisma.groupMembership.create({
      data: { userId: ids.user, groupId: ids.group, year, role: 'MEMBER' },
    });

    await prisma.role.create({
      data: {
        id: ids.role,
        code: `mcp-role-${suffix}`,
        nameNl: 'MCP Testrol',
        nameEn: 'MCP Test role',
      },
    });
    for (const permissionId of [mcpUsePermId, calendarCreatePermId, usersViewPermId]) {
      await prisma.rolePermission.create({
        data: { roleId: ids.role, permissionId },
      });
    }
    await prisma.userRole.create({
      data: { userId: ids.user, roleId: ids.role, year },
    });

    const signInResponse = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    expect(signInResponse.status).toBe(200);
    const setCookies = signInResponse.headers.getSetCookie();
    sessionCookie = setCookies.map((c) => c.split(';')[0]).join('; ');
    expect(sessionCookie).toContain('vtk.session_token=');
  });

  afterAll(async () => {
    if (registeredClientId) {
      await prisma.oauthClient.deleteMany({ where: { clientId: registeredClientId } });
    }
    if (createdResourceId) {
      await prisma.oauthResource.deleteMany({ where: { id: createdResourceId } });
    }
    await prisma.userRole.deleteMany({ where: { roleId: ids.role } });
    await prisma.rolePermission.deleteMany({ where: { roleId: ids.role } });
    await prisma.role.deleteMany({ where: { id: ids.role } });
    await prisma.groupMembership.deleteMany({ where: { groupId: ids.group } });
    await prisma.group.deleteMany({ where: { id: ids.group } });
    await prisma.session.deleteMany({ where: { userId: ids.user } });
    await prisma.account.deleteMany({ where: { userId: ids.user } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    if (createdPermissionIds.length > 0) {
      await prisma.permission.deleteMany({ where: { id: { in: createdPermissionIds } } });
    }
  });

  it('completes DCR, PKCE authorize+consent, JWT token exchange, and /api/mcp enforcement', async () => {
    // 1. Dynamic Client Registration (POST /oauth2/register)
    const registerResponse = await auth.handler(
      new Request(`${origin}${AUTH_BASE_PATH}/oauth2/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_name: `MCP Integration ${suffix}`,
          redirect_uris: [redirectUri],
          scope: 'mcp:read offline_access',
        }),
      }),
    );
    expect(registerResponse.status).toBe(201);
    const registered = (await registerResponse.json()) as {
      client_id: string;
      token_endpoint_auth_method?: string;
    };
    expect(registered.client_id).toBeTruthy();
    expect(registered.token_endpoint_auth_method).toBe('none');
    registeredClientId = registered.client_id;

    // Controleer OauthClient + OauthClientResource koppeling in Postgres.
    const dbClient = await prisma.oauthClient.findUnique({
      where: { clientId: registeredClientId },
      include: { clientResources: { include: { resource: true } } },
    });
    expect(dbClient).not.toBeNull();
    expect(dbClient?.clientResources.some((r) => r.resource.identifier === resourceUrl)).toBe(true);

    // 2. Authorize + Consent met PKCE en RFC 8707 resource
    const codeVerifier = base64Url(Buffer.from(randomUUID() + randomUUID()));
    const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());
    const state = randomUUID();

    const authorizeUrl = new URL(`${origin}${AUTH_BASE_PATH}/oauth2/authorize`);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', registeredClientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('scope', 'mcp:read offline_access');
    authorizeUrl.searchParams.set('resource', resourceUrl);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    const authorizeResponse = await auth.handler(
      new Request(authorizeUrl.toString(), {
        method: 'GET',
        headers: { cookie: sessionCookie },
      }),
    );
    expect(authorizeResponse.status).toBe(302);
    const consentLocation = authorizeResponse.headers.get('location');
    expect(consentLocation).toBeTruthy();
    const consentUrl = new URL(consentLocation!, origin);
    expect(consentUrl.pathname).toBe('/inloggen/consent');

    const oauthQuery = consentUrl.search.slice(1);
    const consentResponse = await auth.handler(
      new Request(`${origin}${AUTH_BASE_PATH}/oauth2/consent`, {
        method: 'POST',
        headers: {
          cookie: sessionCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          accept: true,
          scope: 'mcp:read offline_access',
          oauth_query: oauthQuery,
        }),
      }),
    );
    expect(consentResponse.status).toBe(200);
    const { url: callbackUrlString } = (await consentResponse.json()) as { url: string };
    const callbackUrl = new URL(callbackUrlString);
    expect(`${callbackUrl.origin}${callbackUrl.pathname}`).toBe(redirectUri);
    expect(callbackUrl.searchParams.get('state')).toBe(state);
    const code = callbackUrl.searchParams.get('code');
    expect(code).toBeTruthy();

    // 3. Token exchange (POST /oauth2/token)
    const tokenResponse = await auth.handler(
      new Request(`${origin}${AUTH_BASE_PATH}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code!,
          redirect_uri: redirectUri,
          client_id: registeredClientId,
          code_verifier: codeVerifier,
          resource: resourceUrl,
        }),
      }),
    );
    expect(tokenResponse.status).toBe(200);
    const tokenBody = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      token_type: string;
    };
    expect(tokenBody.token_type.toLowerCase()).toBe('bearer');
    expect(tokenBody.access_token).toBeTruthy();
    expect(tokenBody.refresh_token).toBeTruthy();

    const claims = decodeJwt(tokenBody.access_token);
    const ctx = await auth.$context;
    expect(claims.iss).toBe(ctx.baseURL);
    expect(claims.aud).toBe(resourceUrl);
    expect(claims.sub).toBe(ids.user);

    // 4. Call POST /api/mcp with the real Bearer JWT
    const callMcp = (body: Record<string, unknown>) =>
      mcpPost(
        new Request(resourceUrl, {
          method: 'POST',
          headers: {
            host: new URL(origin).host,
            authorization: `Bearer ${tokenBody.access_token}`,
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify(body),
        }),
      );

    // 4a. Capabilities toont oauth-principal en rechten
    const capsRes = await callMcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'system_list_capabilities', arguments: {} },
    });
    expect(capsRes.status).toBe(200);
    const capsPayload = await parseMcpJsonRpc(capsRes);
    const capsResult = capsPayload.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(capsResult.isError).not.toBe(true);
    const capsJson = JSON.parse(capsResult.content[0]!.text) as {
      principal: { authKind: string; userId: string; scopes: string[] };
    };
    expect(capsJson.principal.authKind).toBe('oauth');
    expect(capsJson.principal.userId).toBe(ids.user);
    expect(capsJson.principal.scopes).toEqual(['mcp:read', 'offline_access']);

    // 4b. OAuth-safe read resource (`calendar`) slaagt
    const calRes = await callMcp({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'app_read', arguments: { resource: 'calendar', limit: 1 } },
    });
    expect(calRes.status).toBe(200);
    const calPayload = await parseMcpJsonRpc(calRes);
    const calResult = calPayload.result as { isError?: boolean };
    expect(calResult.isError).not.toBe(true);

    // 4c. PII/non-allowlisted read resource (`users`) wordt geweigerd ondanks `users.view`
    const usersRes = await callMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'app_read', arguments: { resource: 'users', limit: 1 } },
    });
    expect(usersRes.status).toBe(200);
    const usersPayload = await parseMcpJsonRpc(usersRes);
    const usersResult = usersPayload.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(usersResult.isError).toBe(true);
    expect(usersResult.content[0]?.text).toContain('FORBIDDEN');

    // 5. Live `mcp.use` check: intrekken van `mcp.use` blokkeert het bestaande token meteen
    await prisma.userRole.deleteMany({ where: { userId: ids.user, roleId: ids.role } });
    const revokedRes = await callMcp({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'system_list_capabilities', arguments: {} },
    });
    expect(revokedRes.status).toBe(403);
    expect(await revokedRes.json()).toEqual({ error: 'MCP_FORBIDDEN' });
  });
});
