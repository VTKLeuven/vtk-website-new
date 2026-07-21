import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/locale';
import { requirePermission } from '@/lib/session';
import { exchangeFlowTestCode } from '@vtk/auth/server';
import { takeFlowTestState } from '../actions';

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function Panel({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <pre className="mt-2 overflow-x-auto rounded bg-zinc-50 p-3 text-xs">
        {value === null || value === undefined ? '-' : JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

/**
 * Landingspagina van de testflow: wisselt de autorisatiecode in en toont wat de
 * client terugkrijgt.
 *
 * De uitwisseling gebeurt tijdens het renderen, en een code is eenmalig. Wie
 * deze pagina herlaadt krijgt dus terecht een foutmelding; start dan opnieuw.
 */
export default async function FlowTestCallback({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  if (!hasLocale(locale)) notFound();
  await requirePermission('oauth.client.edit');
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';

  const error = one(sp.error);
  const code = one(sp.code);
  const returnedState = one(sp.state);
  const stored = await takeFlowTestState();

  const restart = (
    <Link href={`${base}/admin/sso/test`} className="text-sm underline">
      {nl ? 'Opnieuw testen' : 'Test again'}
    </Link>
  );

  // De client kreeg een fout terug in plaats van een code, bv. omdat je op
  // "Weigeren" klikte. Dat is een geldig testresultaat.
  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{nl ? 'Flow afgebroken' : 'Flow stopped'}</h1>
        <Panel
          title={nl ? 'Antwoord aan de client' : 'Response to the client'}
          value={{ error, error_description: one(sp.error_description), state: returnedState }}
        />
        <p className="text-sm text-zinc-500">
          {nl
            ? 'Dit is wat een echte applicatie zou ontvangen. Weigeren geeft access_denied.'
            : 'This is what a real application would receive. Refusing gives access_denied.'}
        </p>
        {restart}
      </div>
    );
  }

  if (!code || !stored) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{nl ? 'Geen geldige test' : 'No valid test'}</h1>
        <p className="text-sm text-zinc-500">
          {nl
            ? 'Er is geen lopende test gevonden. Dat gebeurt ook wanneer je deze pagina herlaadt: een autorisatiecode is maar één keer bruikbaar.'
            : 'No test in progress was found. This also happens when you reload this page: an authorization code can only be used once.'}
        </p>
        {restart}
      </div>
    );
  }

  // De state koppelt dit antwoord aan de aanvraag die wij startten; klopt hij
  // niet, dan komt deze code niet van onze flow.
  if (returnedState !== stored.state) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{nl ? 'State komt niet overeen' : 'State mismatch'}</h1>
        <p className="text-sm text-zinc-500">
          {nl
            ? 'Het antwoord hoort niet bij de test die je startte. Start opnieuw.'
            : 'The response does not belong to the test you started. Start again.'}
        </p>
        {restart}
      </div>
    );
  }

  const result = await exchangeFlowTestCode(await headers(), {
    code,
    codeVerifier: stored.codeVerifier,
    redirectUri: stored.redirectUri,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? 'Resultaat' : 'Result'}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? 'Dit is exact wat een integratie terugkrijgt met de scopes die je aanvroeg.'
            : 'This is exactly what an integration receives with the scopes you requested.'}
        </p>
      </div>

      {result.errors.length > 0 && (
        <ul className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {result.errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <Panel title={nl ? 'ID token (claims)' : 'ID token (claims)'} value={result.idTokenClaims} />
      <Panel title="UserInfo" value={result.userInfo} />
      <Panel title={nl ? 'Access token (claims)' : 'Access token (claims)'} value={result.accessTokenClaims} />
      <Panel
        title={nl ? 'Antwoord van het token-endpoint' : 'Token endpoint response'}
        // Het access token zelf is een geldige sleutel; toon hem niet.
        value={{
          ...result.tokenResponse,
          access_token: result.tokenResponse.access_token ? '(verborgen)' : undefined,
          refresh_token: result.tokenResponse.refresh_token ? '(verborgen)' : undefined,
          id_token: result.tokenResponse.id_token ? '(zie hierboven)' : undefined,
        }}
      />

      {restart}
    </div>
  );
}
