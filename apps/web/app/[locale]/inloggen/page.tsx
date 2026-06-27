import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/locale';
import { getDictionary } from '@vtk/i18n';
import { getSession, isKulEnabled } from '@vtk/auth/server';
import { LoginForm } from './LoginForm';
import { KulSignInButton } from './KulSignInButton';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { next, error } = await searchParams;
  if (!hasLocale(locale)) notFound();

  const session = await getSession(await headers());
  if (session) redirect(next && next.startsWith('/') ? next : '/');
  const dict = getDictionary(locale);
  const kulEnabled = isKulEnabled();

  return (
    <div className="vtk-auth">
      <div className="vtk-auth-panel">
        <p className="vtk-auth-kicker">{dict.auth.signInLead}</p>
        <h1 className="vtk-auth-title">{dict.auth.signIn}</h1>
        {error === 'kul' && <p className="vtk-auth-error">{dict.auth.invalidCredentials}</p>}
        <LoginForm
          nextParam={next ?? ''}
          labels={{
            email: dict.auth.email,
            password: dict.auth.password,
            signIn: dict.auth.signIn,
            invalid: dict.auth.invalidCredentials,
          }}
        />
        {kulEnabled && (
          <KulSignInButton nextParam={next ?? ''} label={dict.auth.signInWithKul} />
        )}
      </div>
    </div>
  );
}
