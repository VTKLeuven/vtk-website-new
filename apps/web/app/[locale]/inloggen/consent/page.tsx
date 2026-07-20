/**
 * ⚠ DIT IS GEEN VTK-LOGINSCHERM.
 *
 * Deze pagina hoort bij VTK als OAuth2/OIDC-provider: een externe applicatie
 * vraagt of ze namens dit lid VTK-gegevens mag opvragen. Ze staat onder
 * /inloggen omdat ze in dezelfde flow zit, maar logt niemand in. Wie hier komt
 * is al ingelogd; "weigeren" stuurt terug naar de client met `access_denied`,
 * niet naar vtk.be.
 *
 * Minimale versie uit fase 1; fase 3 bouwt het echte scherm. Zie
 * docs/oauth2-oidc-design.md voor je hier iets wijzigt.
 */
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@vtk/db';
import { getSession } from '@vtk/auth/server';
import { hasLocale } from '@/lib/locale';
import { signedOAuthQuery, type RawSearchParams } from '@/lib/oauthFlow';
import { ConsentForm } from './ConsentForm';

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

  // Zonder ondertekend verzoek is er geen client en geen scopes.
  const oauthQuery = signedOAuthQuery(sp);
  if (!oauthQuery) notFound();

  // De plugin stuurt enkel hierheen met sessie, maar de URL kan later opnieuw
  // geopend worden.
  const session = await getSession(await headers());
  if (!session) redirect(`/inloggen?${oauthQuery}`);

  const clientId = Array.isArray(sp.client_id) ? sp.client_id[0] : sp.client_id;
  const scopeRaw = Array.isArray(sp.scope) ? sp.scope[0] : sp.scope;
  const scopes = scopeRaw?.split(' ').filter(Boolean) ?? [];

  const client = clientId
    ? await prisma.oauthClient.findUnique({
        where: { clientId },
        select: { name: true },
      })
    : null;

  return (
    <div className="vtk-auth">
      <div className="vtk-auth-panel">
        <p className="vtk-auth-kicker">Toegang tot je VTK-account</p>
        <h1 className="vtk-auth-title">{client?.name ?? clientId}</h1>
        <p>Deze applicatie wil namens jou toegang tot je VTK-gegevens. Je bent ingelogd als {session.user.email}.</p>

        {scopes.length > 0 && (
          <ul>
            {scopes.map((scope) => (
              <li key={scope}>{scope}</li>
            ))}
          </ul>
        )}

        <ConsentForm oauthQuery={oauthQuery} />
      </div>
    </div>
  );
}
