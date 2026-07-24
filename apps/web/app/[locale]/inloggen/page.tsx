import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/locale';
import { getDictionary } from '@vtk/i18n';
import { getSession, isKulEnabled } from '@vtk/auth/server';
import { hasPrompt, isOAuthRequest, resumeAuthorizeUrl, type RawSearchParams } from '@/lib/oauthFlow';
import { LoginForm } from './LoginForm';
import { KulSignInButton } from './KulSignInButton';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  // Volledige query: bij een OAuth-autorisatie hangt die er heel aan.
  searchParams: Promise<RawSearchParams>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  if (!hasLocale(locale)) notFound();

  const nextRaw = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const source = Array.isArray(sp.source) ? sp.source[0] : sp.source;
  // `error=kul` ondersteunt callbacks die vóór de nieuwe `source`-parameter
  // gestart zijn. Nieuwe callbacks behouden Better Auths eigen foutcode.
  const hasKulError = source === 'kul' || error === 'kul';

  // Bij een OAuth-flow is de bestemming na login het authorize-endpoint, niet
  // een pagina.
  const oauth = isOAuthRequest(sp);
  const next = oauth ? resumeAuthorizeUrl(sp) : (nextRaw ?? '');

  // `prompt=login` vraagt om een verse authenticatie: een bestaande sessie telt
  // dan niet, anders hervatten we zonder dat er iets bewezen is.
  const mustReauthenticate = oauth && hasPrompt(sp, 'login');

  const session = await getSession(await headers());
  if (session && !mustReauthenticate) {
    redirect(oauth ? next : nextRaw && nextRaw.startsWith('/') ? nextRaw : '/');
  }

  const dict = getDictionary(locale);
  const kulEnabled = isKulEnabled();

  return (
    <div className="vtk-auth">
      <div className="vtk-auth-panel">
        <p className="vtk-auth-kicker">{dict.auth.signInLead}</p>
        <h1 className="vtk-auth-title">{dict.auth.signIn}</h1>
        {hasKulError && <p className="vtk-auth-error">{dict.auth.kulSignInFailed}</p>}
        <LoginForm
          nextParam={next}
          hardRedirect={oauth}
          labels={{
            email: dict.auth.email,
            password: dict.auth.password,
            signIn: dict.auth.signIn,
            invalid: dict.auth.invalidCredentials,
          }}
        />
        {kulEnabled && <KulSignInButton nextParam={next} label={dict.auth.signInWithKul} />}
      </div>
    </div>
  );
}
