import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { verifyUnsubscribeToken } from "@/lib/mailUnsubscribe";
import { UnsubscribePanel, type UnsubscribeState } from "@/components/profile/UnsubscribePanel";
import { unsubscribeMailCategoryAction } from "@/app/actions/mailUnsubscribe";

export const metadata: Metadata = {
  // Een persoonlijke link uit een mail; niets voor een zoekmachine.
  robots: { index: false, follow: false },
};

/**
 * Uitschrijven voor één mailinglijst vanuit de knop in een mail, zonder login.
 * Zie lib/mailUnsubscribe.ts voor de link en waarom er eerst een klik nodig is.
 */
export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const dict = getDictionary(locale);

  const token = (await searchParams).t ?? "";
  const parsed = token ? verifyUnsubscribeToken(token) : null;
  const user = parsed
    ? await prisma.user.findUnique({ where: { id: parsed.userId }, select: { mailCategories: true } })
    : null;

  const state: UnsubscribeState = !parsed || !user
    ? "invalid"
    : user.mailCategories.includes(parsed.category)
      ? "confirm"
      : "done";
  const categoryLabel = parsed ? dict.onboarding.categories[parsed.category] : "";

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">{nl ? "Mailinglijsten" : "Mailing lists"}</div>
          <h1 className="vtk-page-title">{nl ? "Uitschrijven" : "Unsubscribe"}</h1>
        </div>
      </header>
      <div className="vtk-page-shell vtk-page-narrow">
        <UnsubscribePanel
          locale={locale}
          categoryLabel={categoryLabel}
          state={state}
          token={token}
          action={unsubscribeMailCategoryAction}
          accountHref={nl ? "/account" : "/en/account"}
        />
      </div>
    </div>
  );
}
