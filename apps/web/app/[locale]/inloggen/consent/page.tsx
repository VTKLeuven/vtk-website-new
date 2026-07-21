/**
 * ⚠ DIT IS GEEN VTK-LOGINSCHERM.
 *
 * Deze pagina hoort bij VTK als OAuth2/OIDC-provider: een externe applicatie
 * vraagt of ze namens dit lid VTK-gegevens mag opvragen. Ze staat onder
 * /inloggen omdat ze in dezelfde flow zit, maar logt niemand in. Wie hier komt
 * is al ingelogd; "weigeren" stuurt terug naar de client met `access_denied`,
 * niet naar vtk.be.
 *
 * Zie docs/sso.md voor je hier iets wijzigt: de
 * vormgeving van dit scherm is een veiligheidsmaatregel tegen consent-phishing,
 * geen smaakkwestie.
 */
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@vtk/db';
import { getSession } from '@vtk/auth/server';
import { SCOPE_CODES, describeScope, isSensitiveScope } from '@vtk/auth';
import { hasLocale } from '@/lib/locale';
import { signedOAuthQuery, type RawSearchParams } from '@/lib/oauthFlow';
import { ConsentScreen } from './ConsentScreen';
import { ConsentError } from './ConsentError';

/** De app draait volledig op VTK-domeinen; zie ook attention.ts in admin/sso. */
function isVtkOwned(uris: string[]): boolean {
  if (!uris.length) return false;
  return uris.every((uri) => {
    try {
      const { hostname } = new URL(uri);
      return hostname === 'vtk.be' || hostname.endsWith('.vtk.be');
    } catch {
      return false;
    }
  });
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ConsentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  if (!hasLocale(locale)) notFound();
  const nl = locale === 'nl';

  // Zonder ondertekend verzoek is er geen client en geen scopes.
  const oauthQuery = signedOAuthQuery(sp);
  if (!oauthQuery) notFound();

  // Eerst vervallen controleren, nog voor de sessie: een verlopen aanvraag is
  // toch niet meer te redden, en iemand daarvoor eerst door de login sturen is
  // verspilde moeite. De handtekening zelf verifieert de plugin bij het
  // verzenden; `exp` staat gewoon in de query.
  const exp = Number(one(sp.exp));
  if (Number.isFinite(exp) && exp > 0 && new Date(exp * 1000) <= new Date()) {
    return <ConsentError nl={nl} kind="expired" />;
  }

  const session = await getSession(await headers());
  // De plugin stuurt enkel hierheen met sessie, maar de URL kan later opnieuw
  // geopend worden. Een gedeactiveerd lid krijgt hier ook geen sessie.
  if (!session) redirect(`/inloggen?${oauthQuery}`);

  // Toon het scherm in de taal van het lid, niet in die van de URL: de plugin
  // redirect naar een pad zonder locale, dus iedereen landt eerst op /nl.
  if (session.user.locale === 'EN' && nl) {
    redirect(`/en/inloggen/consent?${oauthQuery}`);
  }

  const clientId = one(sp.client_id);
  const client = clientId ? await prisma.oauthClient.findUnique({ where: { clientId } }) : null;

  // Onbekende client krijgt dezelfde melding als een verlopen aanvraag: nooit
  // bevestigen of een client_id bestaat.
  if (!client) return <ConsentError nl={nl} kind="expired" />;
  if (client.disabled) return <ConsentError nl={nl} kind="disabled" />;

  const requested = (one(sp.scope) ?? '').split(' ').filter(Boolean);
  if (!requested.length) return <ConsentError nl={nl} kind="expired" />;

  // Wat het lid deze client al eerder toestond. De plugin stuurt enkel hierheen
  // wanneer er iets nieuws bij is, dus dit is de "delta"-berekening uit 13.5.
  const existing = await prisma.oauthConsent.findFirst({
    where: { clientId: client.clientId, userId: session.user.id },
    select: { scopes: true },
  });
  const alreadyGranted = (existing?.scopes ?? []).filter((scope) => requested.includes(scope));
  const isNew = (scope: string) => !alreadyGranted.includes(scope);

  const known = new Set<string>(SCOPE_CODES);
  const rows = requested
    // `openid` zegt enkel "dit is een login" en release niets; als aparte regel
    // zou het het scherm alleen maar langer maken (11.2).
    .filter((code) => code !== 'openid')
    .map((code) => ({
      code,
      label: describeScope(code, nl ? 'nl' : 'en'),
      // Een scope die we niet kennen behandelen we als gevoelig: dan staat ze
      // niet voorgevinkt en beslist het lid er zelf over.
      sensitive: known.has(code) ? isSensitiveScope(code) : true,
      isNew: isNew(code),
    }));

  return (
    <ConsentScreen
      nl={nl}
      oauthQuery={oauthQuery}
      userEmail={session.user.email}
      client={{
        name: client.name ?? client.clientId,
        logoUri: client.icon,
        clientUri: client.uri,
        policyUri: client.policy,
        tosUri: client.tos,
        vtkOwned: isVtkOwned(client.redirectUris),
      }}
      scopes={rows}
      // Meesturen zodat een gedeeltelijke toestemming de eerder gegeven scopes
      // niet wegduwt: de plugin vervangt de rij, ze vult niet aan.
      alreadyGranted={alreadyGranted}
      requestsOfflineAccess={requested.includes('offline_access')}
    />
  );
}
