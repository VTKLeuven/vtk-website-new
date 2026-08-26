import type { Metadata } from 'next';
import { staticMetadata } from '@/lib/pageMetadata';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/locale';
import { getDictionary } from '@vtk/i18n';
import { getSession, isKulEnabled } from '@vtk/auth/server';
import { hasPrompt, isOAuthRequest, resumeAuthorizeUrl, type RawSearchParams } from '@/lib/oauthFlow';
import { PasswordSignIn } from './PasswordSignIn';
import { KulSignInButton } from './KulSignInButton';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata('login', '/inloggen', locale, { noIndex: true });
}

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
  // `?wachtwoord=1` komt van de registratie- en herstelschermen: die sturen het
  // lid terug naar de inlogpagina waar hij net een wachtwoord instelde, dus daar
  // hoort het e-mailformulier al open te staan.
  const passwordFirst = (Array.isArray(sp.wachtwoord) ? sp.wachtwoord[0] : sp.wachtwoord) === '1';

  // Bij een OAuth-flow is de bestemming na login het authorize-endpoint, niet
  // een pagina.
  const oauth = isOAuthRequest(sp);
  const next = oauth ? resumeAuthorizeUrl(sp) : (nextRaw ?? '');

  // `prompt=login` vraagt om een verse authenticatie: een bestaande sessie telt
  // dan niet, anders hervatten we zonder dat er iets bewezen is.
  const mustReauthenticate = oauth && hasPrompt(sp, 'login');

  const session = await getSession(await headers());
  if (session && !mustReauthenticate) {
    const safeNext = nextRaw?.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';
    redirect(oauth ? next : safeNext);
  }

  const dict = getDictionary(locale);
  const kulEnabled = isKulEnabled();
  const base = locale === 'en' ? '/en' : '';

  return (
    <div className="vtk-auth">
      <div className="vtk-auth-panel">
        <p className="vtk-auth-kicker">{dict.auth.signInLead}</p>
        <h1 className="vtk-auth-title">{dict.auth.signIn}</h1>
        {hasKulError && <p className="vtk-auth-error">{dict.auth.kulSignInFailed}</p>}

        {/* Eén grote knop, want dit is de weg voor bijna iedereen die hier komt.
            Het wachtwoordformulier staat eronder achter een regel tekst; zie
            PasswordSignIn voor waarom. */}
        {kulEnabled && (
          <KulSignInButton nextParam={next} label={dict.auth.signInWithKulLong} />
        )}

        <PasswordSignIn
          nextParam={next}
          hardRedirect={oauth}
          base={base}
          defaultOpen={!kulEnabled || passwordFirst}
          labels={{
            lead: dict.auth.noKulLead,
            link: dict.auth.noKulLink,
            panelTitle: dict.auth.emailPanelTitle,
            panelIntro: dict.auth.emailPanelIntro,
            email: dict.auth.email,
            password: dict.auth.password,
            signIn: dict.auth.signIn,
            invalid: dict.auth.invalidCredentials,
            unverified: dict.auth.unverified,
            resend: dict.auth.resendVerification,
            resendSent: dict.auth.resendVerificationSent,
            noAccountYet: dict.auth.noAccountYet,
            createAccount: dict.auth.createAccount,
            forgotPassword: dict.auth.forgotPassword,
          }}
        />
      </div>
    </div>
  );
}
