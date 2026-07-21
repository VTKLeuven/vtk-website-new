/**
 * @author Witse Panneels
 * @date 2026-07-20
 *
 * Alle logica voor het beheer van OAuth-clients. De admin-GUI roept enkel deze
 * functies aan (server-side) en praat nooit rechtstreeks met de plugin of met
 * de oauth-tabellen.
 *
 * Elke functie neemt `headers` in plaats van een sessie: de plugin heeft ze
 * nodig voor haar eigen `clientPrivileges`-check, en we halen de actor eruit
 * voor de audit-log.
 *
 * Waar mogelijk gaat een mutatie via `auth.api.*` en niet via Prisma. De plugin
 * genereert en hasht client secrets, zet de prefix, en ruimt bij verwijderen de
 * tokens op; dat willen we niet dupliceren.
 */
import 'server-only';

import type { OauthClient, SsoAuditLog } from '@prisma/client';
import { prisma } from '@vtk/db';
import { auth } from '../auth';
import { getSessionCached, hasPermission as sessionHasPermission } from './session';
import { AuthError, hasPermission as rootHasPermission, type SessionPayload } from '..';

/** Gebruikt door de `clientPrivileges`-hook in auth.ts. */
export async function hasSSOPrivileges(headers: Headers): Promise<boolean> {
  return sessionHasPermission(headers, 'oauth.client.edit');
}

/**
 * Eist beheerrechten en geeft de actor terug voor de audit-log. De plugin doet
 * later dezelfde check; deze is er om een nette fout te geven vóór er iets
 * gebeurt, en om te weten wie de actie uitvoert.
 *
 * Via `getSessionCached` en niet `getSession`: de plugin controleert zo dadelijk
 * hetzelfde recht op dezelfde headers, en dan is de sessie al geladen.
 */
async function requireSsoAdmin(headers: Headers): Promise<SessionPayload> {
  const session = await getSessionCached(headers);
  if (!session) throw new AuthError('UNAUTHENTICATED');
  if (!rootHasPermission(session, 'oauth.client.edit')) throw new AuthError('FORBIDDEN');
  return session;
}

export type SsoAuditAction = 'create' | 'update' | 'rotate-secret' | 'enable' | 'disable' | 'delete' | 'revoke-tokens';

/**
 * Schrijft één regel in de audit-log. Namen worden meegekopieerd zodat de regel
 * leesbaar blijft nadat de client of het lid verdwenen is.
 */
async function writeAudit(
  actor: SessionPayload,
  client: { clientId: string; name: string | null },
  action: SsoAuditAction,
  summary?: string
): Promise<void> {
  await prisma.ssoAuditLog.create({
    data: {
      actorId: actor.user.id,
      actorName: actor.user.name,
      clientId: client.clientId,
      clientName: client.name ?? client.clientId,
      action,
      summary: summary ?? null,
    },
  });
}

/** Alle clients, nieuwste eerst. */
export async function listSsoClients(headers: Headers): Promise<OauthClient[]> {
  await requireSsoAdmin(headers);
  return prisma.oauthClient.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function getSsoClient(headers: Headers, clientId: string): Promise<OauthClient | null> {
  await requireSsoAdmin(headers);
  return prisma.oauthClient.findUnique({ where: { clientId } });
}

export type CreateSsoClientInput = {
  name: string;
  redirectUris: string[];
  scopes?: string[];
  clientUri?: string;
  logoUri?: string;
  contacts?: string[];
  skipConsent?: boolean;
  /** `native` en `user-agent-based` zijn publieke clients: die krijgen geen secret. */
  type?: 'web' | 'native' | 'user-agent-based';
};

/**
 * Maakt een client aan. Het secret komt hier één keer terug en is daarna niet
 * meer op te vragen (de database bewaart enkel de hash); toon het dus meteen en
 * bewaar het nergens anders.
 */
export async function createSsoClient(
  headers: Headers,
  input: CreateSsoClientInput
): Promise<{ client: OauthClient; clientSecret?: string }> {
  const actor = await requireSsoAdmin(headers);

  const created = await auth.api.adminCreateOAuthClient({
    headers,
    body: {
      client_name: input.name,
      redirect_uris: input.redirectUris,
      ...(input.scopes?.length ? { scope: input.scopes.join(' ') } : {}),
      ...(input.clientUri ? { client_uri: input.clientUri } : {}),
      ...(input.logoUri ? { logo_uri: input.logoUri } : {}),
      ...(input.contacts?.length ? { contacts: input.contacts } : {}),
      ...(input.skipConsent !== undefined ? { skip_consent: input.skipConsent } : {}),
      ...(input.type ? { type: input.type } : {}),
    },
  });

  const clientId = (created as { client_id: string }).client_id;
  const clientSecret = (created as { client_secret?: string }).client_secret;

  const client = await prisma.oauthClient.findUniqueOrThrow({ where: { clientId } });
  await writeAudit(actor, client, 'create');

  return { client, clientSecret };
}

export type UpdateSsoClientInput = {
  name?: string;
  redirectUris?: string[];
  scopes?: string[];
  clientUri?: string;
  logoUri?: string;
  contacts?: string[];
  skipConsent?: boolean;
};

/**
 * Werkt de gegevens van een client bij.
 *
 * Let op `redirectUris`: wie daar een adres aan toevoegt, kan autorisatiecodes
 * van echte leden naar zich toe laten sturen. Dat is de gevoeligste wijziging op
 * dit scherm en daarom staat ze apart in de audit-samenvatting.
 */
export async function updateSsoClient(
  headers: Headers,
  clientId: string,
  input: UpdateSsoClientInput
): Promise<OauthClient> {
  const actor = await requireSsoAdmin(headers);
  const before = await prisma.oauthClient.findUniqueOrThrow({ where: { clientId } });

  await auth.api.adminUpdateOAuthClient({
    headers,
    body: {
      client_id: clientId,
      update: {
        ...(input.name !== undefined ? { client_name: input.name } : {}),
        ...(input.redirectUris ? { redirect_uris: input.redirectUris } : {}),
        ...(input.scopes ? { scope: input.scopes.join(' ') } : {}),
        ...(input.clientUri !== undefined ? { client_uri: input.clientUri } : {}),
        ...(input.logoUri !== undefined ? { logo_uri: input.logoUri } : {}),
        ...(input.contacts ? { contacts: input.contacts } : {}),
        ...(input.skipConsent !== undefined ? { skip_consent: input.skipConsent } : {}),
      },
    },
  });

  const redirectsChanged =
    input.redirectUris !== undefined && input.redirectUris.join(' ') !== before.redirectUris.join(' ');

  const client = await prisma.oauthClient.findUniqueOrThrow({ where: { clientId } });
  await writeAudit(actor, client, 'update', redirectsChanged ? "redirect-URI's gewijzigd" : undefined);
  return client;
}

/**
 * Zet een client aan of uit. Uitzetten weigert nieuwe autorisaties meteen, maar
 * raakt reeds uitgedeelde access tokens niet aan; combineer met
 * `revokeSsoClientTokens` wanneer de toegang echt nu moet stoppen.
 *
 * Gaat rechtstreeks naar Prisma: `disabled` zit niet in de update-body van de
 * plugin.
 */
export async function setSsoClientDisabled(
  headers: Headers,
  clientId: string,
  disabled: boolean
): Promise<OauthClient> {
  const actor = await requireSsoAdmin(headers);
  const client = await prisma.oauthClient.update({
    where: { clientId },
    data: { disabled },
  });
  await writeAudit(actor, client, disabled ? 'disable' : 'enable');
  return client;
}

/**
 * Geeft een nieuw secret en maakt het oude meteen ongeldig: elke integratie die
 * het oude gebruikt, valt stil tot ze het nieuwe krijgt. Ook dit secret is
 * eenmalig zichtbaar.
 */
export async function rotateSsoClientSecret(headers: Headers, clientId: string): Promise<{ clientSecret: string }> {
  const actor = await requireSsoAdmin(headers);
  const result = await auth.api.rotateClientSecret({ headers, body: { client_id: clientId } });

  const clientSecret = (result as { client_secret?: string }).client_secret;
  if (!clientSecret) throw new Error('rotateClientSecret gaf geen secret terug');

  const client = await prisma.oauthClient.findUniqueOrThrow({ where: { clientId } });
  await writeAudit(actor, client, 'rotate-secret');
  return { clientSecret };
}

/**
 * Verwijdert de client definitief. Bestaande toestemmingen en tokens gaan mee;
 * de audit-regels blijven staan (die hebben bewust geen foreign key).
 */
export async function deleteSsoClient(headers: Headers, clientId: string): Promise<void> {
  const actor = await requireSsoAdmin(headers);
  const client = await prisma.oauthClient.findUniqueOrThrow({ where: { clientId } });

  await auth.api.deleteOAuthClient({ headers, body: { client_id: clientId } });
  await writeAudit(actor, client, 'delete');
}

/**
 * Trekt de uitgedeelde tokens van een client in.
 *
 * Belangrijke nuance: een reeds uitgedeelde JWT access token blijft geldig tot
 * hij vervalt, want de client controleert die zelf en vraagt niets na. Wat dit
 * wél doet is de refresh tokens weggooien, zodat er niets meer vernieuwd kan
 * worden. Noem in de UI dus het resterende venster.
 */
export async function revokeSsoClientTokens(
  headers: Headers,
  clientId: string
): Promise<{ accessTokens: number; refreshTokens: number }> {
  const actor = await requireSsoAdmin(headers);
  const client = await prisma.oauthClient.findUniqueOrThrow({ where: { clientId } });

  const [access, refresh] = await prisma.$transaction([
    prisma.oauthAccessToken.deleteMany({ where: { clientId } }),
    prisma.oauthRefreshToken.deleteMany({ where: { clientId } }),
  ]);

  await writeAudit(actor, client, 'revoke-tokens', `${refresh.count} refresh tokens ingetrokken`);
  return { accessTokens: access.count, refreshTokens: refresh.count };
}

/** Audit-log, nieuwste eerst. Zonder `clientId` de volledige log. */
export async function listSsoAuditLog(
  headers: Headers,
  options?: { clientId?: string; take?: number }
): Promise<SsoAuditLog[]> {
  await requireSsoAdmin(headers);
  return prisma.ssoAuditLog.findMany({
    where: options?.clientId ? { clientId: options.clientId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: options?.take ?? 100,
  });
}

// ==============================
// Zelfbediening voor leden
// ==============================

export type ConnectedApp = {
  clientId: string;
  name: string;
  logoUri: string | null;
  clientUri: string | null;
  scopes: string[];
  grantedAt: Date;
};

/**
 * De applicaties waaraan dit lid toegang gaf. Geen beheerrecht nodig: iedereen
 * ziet enkel zijn eigen koppelingen.
 */
export async function listConnectedApps(headers: Headers): Promise<ConnectedApp[]> {
  const session = await getSessionCached(headers);
  if (!session) throw new AuthError('UNAUTHENTICATED');

  const consents = await prisma.oauthConsent.findMany({
    where: { userId: session.user.id },
    include: { client: true },
    orderBy: { createdAt: 'desc' },
  });

  return consents.map((consent) => ({
    clientId: consent.clientId,
    name: consent.client.name ?? consent.clientId,
    logoUri: consent.client.icon,
    clientUri: consent.client.uri,
    scopes: consent.scopes,
    grantedAt: consent.createdAt,
  }));
}

/**
 * Verbreekt de koppeling met één applicatie: de toestemming verdwijnt en de
 * tokens van dit lid voor die client worden weggegooid. Dezelfde nuance als bij
 * `revokeSsoClientTokens` geldt voor reeds uitgedeelde access tokens.
 *
 * Staat niet in de audit-log: die gaat over beheerdersacties op clients, en een
 * lid dat zijn eigen koppeling verbreekt hoort daar niet in.
 */
export async function disconnectApp(headers: Headers, clientId: string): Promise<void> {
  const session = await getSessionCached(headers);
  if (!session) throw new AuthError('UNAUTHENTICATED');
  const userId = session.user.id;

  await prisma.$transaction([
    prisma.oauthAccessToken.deleteMany({ where: { clientId, userId } }),
    prisma.oauthRefreshToken.deleteMany({ where: { clientId, userId } }),
    prisma.oauthConsent.deleteMany({ where: { clientId, userId } }),
  ]);
}
