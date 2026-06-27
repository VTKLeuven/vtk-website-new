import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/locale';
import { getDictionary } from '@vtk/i18n';
import { getSession } from '@vtk/auth/server';
import { LoginForm } from './LoginForm';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  if (!hasLocale(locale)) notFound();

  const session = await getSession(await headers());
  if (session) redirect(next && next.startsWith('/') ? next : '/');
  const dict = getDictionary(locale);

  return (
    <div className="vtk-auth">
      <div className="vtk-auth-panel">
        <p className="vtk-auth-kicker">{dict.auth.signInLead}</p>
        <h1 className="vtk-auth-title">{dict.auth.signIn}</h1>
        <LoginForm
          nextParam={next ?? ''}
          labels={{
            email: dict.auth.email,
            password: dict.auth.password,
            signIn: dict.auth.signIn,
            invalid: dict.auth.invalidCredentials,
          }}
        />
      </div>
    </div>
  );
}
