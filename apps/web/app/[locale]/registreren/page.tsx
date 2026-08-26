import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDictionary, type Locale } from "@vtk/i18n";
import { getSession } from "@vtk/auth/server";
import { hasLocale } from "@/lib/locale";
import { staticMetadata } from "@/lib/pageMetadata";
import { RegisterForm } from "./RegisterForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("register", "/registreren", locale, { noIndex: true });
}

/**
 * Zelf een account maken met e-mail en wachtwoord.
 *
 * De tweede deur naast KU Leuven SSO, en de reden dat ze bestaat: een alumnus
 * van 2004 heeft geen werkende KU Leuven-login meer, en die groep is net wie we
 * op onze evenementen willen. Zie `registerSelfServiceAccount`.
 */
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === "en" ? "/en" : "";

  // Wie al ingelogd is heeft hier niets te zoeken.
  const session = await getSession(await headers());
  if (session) redirect(base || "/");

  const dict = getDictionary(locale);
  const t = dict.register;

  return (
    <div className="vtk-auth">
      <div className="vtk-auth-panel vtk-auth-panel-wide">
        <p className="vtk-auth-kicker">{t.kicker}</p>
        <h1 className="vtk-auth-title">{t.title}</h1>
        <p className="vtk-auth-intro">{t.intro}</p>

        <RegisterForm
          locale={locale}
          labels={{
            firstName: t.firstName,
            lastName: t.lastName,
            email: t.email,
            emailHint: t.emailHint,
            password: t.password,
            passwordHint: t.passwordHint,
            passwordRepeat: t.passwordRepeat,
            alumni: t.alumni,
            graduationYear: t.graduationYear,
            graduationYearHint: t.graduationYearHint,
            wasInVtk: t.wasInVtk,
            mailOptIn: t.mailOptIn,
            submit: t.submit,
            sentTitle: t.sentTitle,
            sentBody: t.sentBody,
            sentSpam: t.sentSpam,
            errors: {
              INVALID_REGISTRATION: t.errorInvalid,
              PASSWORD_TOO_SHORT: t.errorPasswordShort,
              PASSWORD_MISMATCH: t.errorPasswordMismatch,
              MAIL_FAILED: t.errorMailFailed,
            },
            errorFallback: t.errorInvalid,
          }}
        />

        <p className="vtk-auth-links">
          <Link href={`${base}/inloggen`}>{dict.auth.back}</Link>
        </p>
      </div>
    </div>
  );
}
