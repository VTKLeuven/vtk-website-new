import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { staticMetadata } from "@/lib/pageMetadata";
import { NewPasswordForm } from "./NewPasswordForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("passwordReset", "/wachtwoord-vergeten/nieuw", locale, { noIndex: true });
}

export const dynamic = "force-dynamic";

/**
 * De bestemming van de herstellink. De token wordt hier nog niet verzilverd: dat
 * gebeurt pas bij het indienen, zodat een mailclient die links vooraf ophaalt
 * (Outlook doet dat) de link niet opbrandt voor het lid hem opent.
 */
export default async function NewPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === "en" ? "/en" : "";

  const sp = await searchParams;
  const token = (Array.isArray(sp.token) ? sp.token[0] : sp.token) ?? "";

  const dict = getDictionary(locale);
  const t = dict.passwordReset;

  return (
    <div className="vtk-auth">
      <div className="vtk-auth-panel">
        <p className="vtk-auth-kicker">{t.kicker}</p>
        {token ? (
          <>
            <h1 className="vtk-auth-title">{t.newTitle}</h1>
            <p className="vtk-auth-intro">{t.newIntro}</p>
            <NewPasswordForm
              token={token}
              signInHref={`${base}/inloggen?wachtwoord=1`}
              labels={{
                password: t.password,
                passwordRepeat: t.passwordRepeat,
                submit: t.newSubmit,
                signIn: dict.auth.signIn,
                doneTitle: t.doneTitle,
                doneBody: t.doneBody,
                errors: {
                  INVALID_INPUT: t.errorInvalid,
                  PASSWORD_TOO_SHORT: t.errorPasswordShort,
                  PASSWORD_MISMATCH: t.errorPasswordMismatch,
                  TOKEN_INVALID: t.expiredBody,
                },
                errorFallback: t.errorInvalid,
              }}
            />
          </>
        ) : (
          <>
            <h1 className="vtk-auth-title">{t.expiredTitle}</h1>
            <p className="vtk-auth-done">{t.expiredBody}</p>
            <Link
              className="vtk-auth-submit"
              href={`${base}/wachtwoord-vergeten`}
              style={{ display: "grid", placeItems: "center", textDecoration: "none" }}
            >
              {t.submit}
            </Link>
          </>
        )}
        <p className="vtk-auth-links">
          <Link href={`${base}/inloggen`}>{dict.auth.back}</Link>
        </p>
      </div>
    </div>
  );
}
