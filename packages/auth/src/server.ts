/**
 * @author Witse Panneels
 * @date 2026-06-19
 *
 * better-auth server components, to be used on central platform / app (@vtk/web)
 * Also includes functions for sso and session validation for remote apps (@vtk/logistiek, ...)
 *
 * If you are working on a remote app, please do not use this file/these components, use ./remote.ts instead!
 *
 * !do not import these into a client component!
 */
import 'server-only';
import { auth } from './auth';
import { AUTH_BASE_PATH } from './index';

export { hashPassword } from './logins/password';
export { isKulEnabled } from './logins/kul';
export { ApiHandler } from './apiHandlers/apiHandler';
export { getSession } from './server/session';
export { resolveClaims, type ResolveClaimsInput } from './server/claims';
export { createUser, updateUser, setUserPassword, deleteUser } from './server/users';
export {
  listSsoClients,
  getSsoClient,
  createSsoClient,
  updateSsoClient,
  setSsoClientDisabled,
  rotateSsoClientSecret,
  deleteSsoClient,
  revokeSsoClientTokens,
  listSsoAuditLog,
  listConnectedApps,
  disconnectApp,
  type CreateSsoClientInput,
  type UpdateSsoClientInput,
  type ConnectedApp,
  type SsoAuditAction,
  ensureFlowTestClient,
  exchangeFlowTestCode,
  resetFlowTestState,
  FLOW_TEST_CLIENT_ID,
  FLOW_TEST_NAMESPACE,
  type FlowTestResult,
  type FlowTestSetup,
} from './server/sso';
export { effectiveClientPermissions } from './server/clientPermissions';
export { checkClientAccess, countMembersWithAccess, type ClientAccess } from './server/clientAccess';
export {
  listClientPermissions,
  listClientGrants,
  accessRoleGrantCountsByClient,
  listAllClientPermissions,
  listRoleClientPermissions,
  setRoleClientPermission,
  setClientAccessMode,
  createClientPermission,
  updateClientPermission,
  deleteClientPermission,
  grantClientPermission,
  revokeClientPermission,
  type ClientPermissionRow,
  type ClientPermissionInput,
  type ClientPermissionError,
  type ClientGrants,
  type GrantTarget,
} from './server/clientPermissionsAdmin';

export async function signInEmail(
  headers: Headers,
  body: {
    email: string;
    password: string;
  }
) {
  return auth.api.signInEmail({
    headers,
    body,
  });
}

export async function signOut(headers: Headers) {
  return auth.api.signOut({
    headers,
  });
}

/**
 * Verwerkt de keuze van het lid op het toestemmingsscherm. `oauth_query` moet
 * de ondertekende autorisatie-query zijn zoals ze binnenkwam; een ontbrekende
 * ondertekende parameter geeft `invalid_signature`. Geeft de URL terug waar de
 * browser naartoe moet.
 */
export async function oauthConsent(
  headers: Headers,
  body: { accept: boolean; scope?: string; oauth_query: string }
): Promise<{ url: string }> {
  // `request` moet mee, ook al roepen we de endpoint rechtstreeks aan.
  //
  // Bij "toestaan" draait de plugin de autorisatie opnieuw, en `authorizeEndpoint`
  // begint met `if (!ctx.request) throw ... "request not found"`. Roep je de API
  // aan met enkel `headers` (zoals vanuit een server action), dan is er geen
  // Request en faalt élke toestemming; weigeren werkt wél, want dat pad keert
  // terug vóór die heraanroep. Precies dat verschil verstopte de bug tot de
  // flow voor het eerst helemaal doorlopen werd.
  //
  // De plugin gebruikt `ctx.request` enkel voor die controle en voor
  // `request.headers` in haar redirect-hooks, dus volstaat een verzoek met de
  // echte headers; de body leest ze uit `ctx.body`.
  const consentUrl = `${process.env.BETTER_AUTH_URL ?? ''}${AUTH_BASE_PATH}/oauth2/consent`;
  const request = new Request(consentUrl, { method: 'POST', headers });

  const result = await auth.api.oauth2Consent({ headers, body, request });

  // De plugin zet zelf `accept: application/json`, dus komt de bestemming als
  // waarde terug in plaats van als een echte 302.
  const url = (result as { redirect?: boolean; url?: string })?.url;
  if (!url) throw new Error('oauth2Consent gaf geen redirect-URL terug');
  return { url };
}
