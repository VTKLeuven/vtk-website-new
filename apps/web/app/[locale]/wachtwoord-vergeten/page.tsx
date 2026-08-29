import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { staticMetadata } from "@/lib/pageMetadata";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("passwordReset", "/wachtwoord-vergeten", locale, { noIndex: true });
}

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === "en" ? "/en" : "";

  const dict = getDictionary(locale);
  const t = dict.passwordReset;

  return (
    <div className="vtk-auth">
      <div className="vtk-auth-panel">
        <p className="vtk-auth-kicker">{t.kicker}</p>
        <h1 className="vtk-auth-title">{t.title}</h1>
        <p className="vtk-auth-intro">{t.intro}</p>

        <ForgotPasswordForm
          locale={locale}
          labels={{
            email: t.email,
            submit: t.submit,
            sentTitle: t.sentTitle,
            sentBody: t.sentBody,
            error: t.errorInvalid,
          }}
        />

        {/* Wie via KU Leuven inlogt heeft hier geen wachtwoord; dat is de
            veelvoorkomendste reden dat deze pagina niets oplost. */}
        <p className="vtk-auth-hint" style={{ marginTop: 18 }}>
          {t.kulNote}
        </p>

        <p className="vtk-auth-links">
          <Link href={`${base}/inloggen`}>{dict.auth.back}</Link>
        </p>
      </div>
    </div>
  );
}
