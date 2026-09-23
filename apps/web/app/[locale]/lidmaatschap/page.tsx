import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import { Card } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { staticMetadata } from "@/lib/pageMetadata";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { currentStudyYear, formatWorkingYear } from "@/lib/workingYear";
import { getMembership, getMembershipConfig, membershipOffer } from "@/lib/membership";
import { JoinMembershipCard } from "./JoinMembershipCard";
import { formatEuro } from "@/lib/membership/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("membership", "/lidmaatschap", locale, { noIndex: true });
}

/**
 * De statuspagina van het eigen lidmaatschap: wat je status is, en de knop om
 * een openstaande betaling (opnieuw) te starten.
 *
 * Het is ook de terugkeerpagina van de betaalprovider. De webhook is wat een
 * lidmaatschap activeert, niet deze pagina: wie terugkomt voor de melding
 * binnen is, leest hier dat het nog even duurt in plaats van dat het mislukt is.
 */
export default async function MembershipPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ betaling?: string }>;
}) {
  const [{ locale: localeParam }, query] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const prefix = locale === "en" ? "/en" : "";
  const session = await requireSession(`/inloggen?next=${prefix}/lidmaatschap`);

  const t = getDictionary(locale).membership;
  const year = currentStudyYear();
  const yearLabel = formatWorkingYear(year);
  const [user, membership, config] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { firwStudent: true },
    }),
    getMembership(session.user.id, year),
    getMembershipConfig(),
  ]);

  const price = formatEuro(
    membership?.priceCents ?? config.externalPriceCents,
    locale === "en" ? "en" : "nl",
  );
  const active = membership?.activatedAt != null;
  const pending = membership != null && membership.activatedAt == null;
  // Wie de vraag bij de studiebevestiging liet staan, kan hier alsnog. Het
  // aanbod wordt op dezelfde manier bepaald als daar, en de action rekent het
  // serverside nog eens na.
  const offer = membershipOffer(user, membership, config);

  const status = active
    ? membership.kind === "FACULTY"
      ? t.statusActiveFaculty.replace("{year}", yearLabel)
      : t.statusActive.replace("{year}", yearLabel)
    : pending
      ? t.statusPending.replace("{year}", yearLabel).replace("{price}", price)
      : user.firwStudent
        ? t.statusFirw
        : t.statusNone;

  const notice =
    query.betaling === "terug"
      ? t.paymentReturned
      : query.betaling === "geannuleerd"
        ? t.paymentCancelled
        : query.betaling === "mislukt"
          ? t.paymentFailed
          : null;

  return (
    <div className="vtk-page vtk-page-shell vtk-page-narrow space-y-6">
      <div>
        <div className="vtk-page-kicker">{t.kicker}</div>
        <h1 className="text-4xl font-semibold tracking-tight text-vtk-ink">{t.pageTitle}</h1>
        <p className="mt-2 max-w-2xl text-[#34405e]">
          {t.pageSubtitle.replace("{year}", yearLabel)}
        </p>
      </div>

      {notice ? (
        <Card className="border-vtk-yellow/40 bg-vtk-yellow/10 p-4 text-sm text-vtk-ink">
          {notice}
        </Card>
      ) : null}

      <Card className="space-y-4 p-6">
        <p className="text-vtk-ink">{status}</p>
        {active && membership.activatedAt ? (
          <p className="text-sm text-[#5c667f]">
            {t.since.replace(
              "{date}",
              membership.activatedAt.toLocaleDateString(locale === "en" ? "en-GB" : "nl-BE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }),
            )}
          </p>
        ) : null}
        {pending ? (
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-vtk-ink bg-vtk-ink px-4 text-sm font-medium text-vtk-surface shadow-sm transition-colors hover:bg-vtk-navy"
            href={`${prefix}/lidmaatschap/betalen`}
          >
            {query.betaling ? t.payAgain : t.pay.replace("{price}", price)}
          </Link>
        ) : null}
      </Card>

      {offer.kind === "none" ? null : (
        <JoinMembershipCard
          locale={locale === "en" ? "en" : "nl"}
          heading={t.joinHeading}
          intro={offer.kind === "faculty" ? t.facultyHint : t.externalHint}
          submitLabel={
            offer.kind === "faculty"
              ? t.joinFree.replace("{year}", yearLabel)
              : t.joinPaid.replace(
                  "{price}",
                  formatEuro(offer.priceCents, locale === "en" ? "en" : "nl"),
                )
          }
          savingLabel={t.joinSaving}
          savedMessage={t.joined}
          closedMessage={t.joinClosed}
          failedMessage={t.joinFailed}
        />
      )}
    </div>
  );
}
