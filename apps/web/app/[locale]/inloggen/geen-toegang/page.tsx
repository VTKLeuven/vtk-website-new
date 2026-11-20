import type { Metadata } from 'next';
import { staticMetadata } from '@/lib/pageMetadata';
/**
 * ⚠ DIT IS GEEN VTK-LOGINSCHERM.
 *
 * Hier landt een lid dat wél is ingelogd bij VTK, maar geen toegang heeft tot
 * de applicatie die hierheen stuurde: die staat op "beperkt" en het lid houdt
 * de `<namespace>.access`-permissie niet, of ze vraagt een KU Leuven-login (of
 * een studentenaccount) die er niet is. Het paneel zelf staat in
 * components/auth/NoAccessPanel.tsx, zodat /admin/it/flows het ook toont.
 *
 * De blokkade zelf gebeurt in de autorisatieflow (zie de `signup`-hook in
 * packages/auth/src/auth.ts); deze pagina legt ze enkel uit. Ze stuurt bewust
 * niet door naar de `redirect_uri`: een client die meteen opnieuw begint, zet
 * het lid anders in een lus die het zelf niet kan doorbreken.
 */
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getDictionary } from '@vtk/i18n';
import { checkClientAccess, getSession, verifySignedOAuthQuery } from '@vtk/auth/server';
import { NoAccessPanel } from '@/components/auth/NoAccessPanel';
import { hasLocale } from '@/lib/locale';
import { resumeAuthorizeUrl, signedOAuthQuery, type RawSearchParams } from '@/lib/oauthFlow';

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata('noAccess', '/inloggen/geen-toegang', locale, { noIndex: true });
}

export default async function NoAccessPage({
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

  // Zonder ondertekend verzoek is er geen flow en hoort hier niemand te staan.
  const oauthQuery = signedOAuthQuery(sp);
  if (!oauthQuery) notFound();

  // En de handtekening moet ook kloppen. `signedOAuthQuery` kijkt enkel of de
  // ondertekende sleutels aanwezig zijn; zonder deze controle kan elk ingelogd
  // lid een `client_id` naar keuze in de URL zetten en aan de titel aflezen of
  // die client bestaat. Dat is precies het lek dat het toestemmingsscherm
  // vermijdt, en het hoort hier niet alsnog open te staan.
  if (!(await verifySignedOAuthQuery(oauthQuery))) notFound();

  const session = await getSession(await headers());
  if (!session) redirect(`/inloggen?${oauthQuery}`);

  // Toon in de taal van het lid: de plugin redirect naar een pad zonder locale,
  // dus iedereen landt eerst op /nl.
  if (session.user.locale === 'EN' && nl) {
    redirect(`/en/inloggen/geen-toegang?${oauthQuery}`);
  }

  // De handtekening hierboven is al gecontroleerd, dus dit `client_id` komt van
  // de plugin en niet van de bezoeker; de naam en de reden tonen verklapt hier
  // dus niets. Dezelfde controle als de poort, zodat de uitleg niet afwijkt van
  // wat de poort besliste.
  const clientId = one(sp.client_id);
  const access = clientId ? await checkClientAccess(session.user.id, clientId) : null;

  // Intussen wel binnen (bv. net via KU Leuven aangemeld in een ander tabblad):
  // gewoon verder met de autorisatie in plaats van een blokpagina die niet meer klopt.
  if (access?.allowed) redirect(resumeAuthorizeUrl(sp));

  return (
    <div className="vtk-auth">
      <NoAccessPanel
        nl={nl}
        appName={access?.clientName ?? null}
        reason={access?.reason ?? 'permission'}
        kulRequirement={access?.kulRequirement ?? 'NONE'}
        kulLabel={getDictionary(locale).auth.signInWithKulLong}
        resumeUrl={resumeAuthorizeUrl(sp)}
      />
    </div>
  );
}
