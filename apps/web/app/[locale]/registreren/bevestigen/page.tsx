import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, type Locale } from "@vtk/i18n";
import { confirmEmailToken } from "@vtk/auth/server";
import { hasLocale } from "@/lib/locale";
import { staticMetadata } from "@/lib/pageMetadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("register", "/registreren/bevestigen", locale, { noIndex: true });
}

// De token wordt hier verzilverd, dus deze pagina mag nooit gecachet worden.
export const dynamic = "force-dynamic";

/**
 * De bestemming van de bevestigingslink uit de registratiemail.
 *
 * Een tweede klik op dezelfde link faalt: de token is eenmalig. Dat is bijna
 * altijd iemand die zijn mail nog eens opent nadat het al gelukt is, dus het
 * "werkt niet meer"-scherm wijst meteen naar de inlogknop in plaats van naar een
 * nieuwe mail.
 */
export default async function ConfirmRegistrationPage({
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
  const token = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  const confirmed = token ? await confirmEmailToken(token) : null;

  const dict = getDictionary(locale);
  const t = dict.register;

  return (
    <div className="vtk-auth">
      <div className="vtk-auth-panel">
        <p className="vtk-auth-kicker">{t.kicker}</p>
        <h1 className="vtk-auth-title">{confirmed ? t.confirmTitle : t.confirmFailedTitle}</h1>
        <p className="vtk-auth-done">{confirmed ? t.confirmBody : t.confirmFailedBody}</p>
        <Link className="vtk-auth-submit" href={`${base}/inloggen?wachtwoord=1`} style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>
          {dict.auth.signIn}
        </Link>
      </div>
    </div>
  );
}
