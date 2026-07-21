/**
 * ⚠ DIT IS GEEN VTK-LOGINSCHERM.
 *
 * Hier landt een lid dat wél is ingelogd bij VTK, maar geen toegang heeft tot
 * de applicatie die hem hierheen stuurde. Die applicatie staat op "beperkt" en
 * het lid houdt de `<namespace>.access`-permissie niet.
 *
 * De blokkade zelf gebeurt in de autorisatieflow (zie de `signup`-hook in
 * packages/auth/src/auth.ts); deze pagina legt ze enkel uit. Ze stuurt bewust
 * niet door naar de `redirect_uri`: een client die meteen opnieuw begint, zet
 * het lid anders in een lus die het zelf niet kan doorbreken.
 */
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@vtk/db';
import { getSession, verifySignedOAuthQuery } from '@vtk/auth/server';
import { hasLocale } from '@/lib/locale';
import { signedOAuthQuery, type RawSearchParams } from '@/lib/oauthFlow';

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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

  // Enkel de naam ophalen. De handtekening hierboven is al gecontroleerd, dus
  // dit `client_id` komt van de plugin en niet van de bezoeker; de naam tonen
  // verklapt hier dus niets.
  const clientId = one(sp.client_id);
  const client = clientId
    ? await prisma.oauthClient.findUnique({ where: { clientId }, select: { name: true } })
    : null;
  const appName = client?.name ?? null;

  const title = nl
    ? appName
      ? `Je hebt geen toegang tot ${appName}`
      : 'Je hebt geen toegang tot deze toepassing'
    : appName
      ? `You do not have access to ${appName}`
      : 'You do not have access to this application';

  return (
    <div className="vtk-auth">
      <div className="vtk-auth-panel">
        <h1 className="vtk-auth-title">{title}</h1>
        <p className="text-sm text-[#5c667f]">
          {nl
            ? 'Je bent aangemeld bij VTK, maar deze toepassing is enkel toegankelijk voor leden die er expliciet toegang toe kregen.'
            : 'You are signed in to VTK, but this application is only available to members who have explicitly been given access.'}
        </p>
        <p className="mt-3 text-sm text-[#5c667f]">
          {nl
            ? 'Denk je dat je hier wel bij moet kunnen? Vraag toegang aan bij de post die de toepassing beheert, of bij VTK IT.'
            : 'Think you should have access? Ask the group that manages the application, or VTK IT.'}
        </p>
        <p className="mt-6 text-sm">
          <a className="underline" href={nl ? '/' : '/en'}>
            {nl ? 'Terug naar vtk.be' : 'Back to vtk.be'}
          </a>
        </p>
      </div>
    </div>
  );
}
