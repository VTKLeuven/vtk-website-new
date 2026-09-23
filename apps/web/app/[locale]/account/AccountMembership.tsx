import Link from "@/components/ui/Link";
import { Card } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { formatWorkingYear } from "@/lib/workingYear";
import { formatEuro } from "@/lib/membership/config";

/**
 * Het eigen lidmaatschap op /account: de status in één zin, en een knop wanneer
 * er nog betaald moet worden.
 *
 * Bewust geen tweede vinkje naast het profielformulier: de keuze wordt gevraagd
 * bij de studiebevestiging, en twee plaatsen om lid te worden zijn twee
 * plaatsen die uit elkaar lopen. Vandaar één lijn met een link naar het
 * lidmaatschapsscherm.
 */
export function AccountMembership({
  locale,
  year,
  firwStudent,
  membership,
  canJoin,
}: {
  locale: Locale;
  year: number;
  firwStudent: boolean;
  membership: { kind: string; priceCents: number; activatedAt: Date | null } | null;
  /** Staat er nog een weg naar een lidmaatschap open voor dit lid? */
  canJoin: boolean;
}) {
  const t = getDictionary(locale).membership;
  const prefix = locale === "en" ? "/en" : "";
  const yearLabel = formatWorkingYear(year);
  const active = membership?.activatedAt != null;
  const pending = membership != null && membership.activatedAt == null;

  const status = active
    ? membership.kind === "FACULTY"
      ? t.statusActiveFaculty.replace("{year}", yearLabel)
      : t.statusActive.replace("{year}", yearLabel)
    : pending
      ? t.statusPending
          .replace("{year}", yearLabel)
          .replace("{price}", formatEuro(membership.priceCents, locale === "en" ? "en" : "nl"))
      : firwStudent
        ? t.statusFirw
        : t.statusNone;

  return (
    <Card className="p-6">
      <h3 className="mb-2 text-lg font-semibold text-vtk-ink">{t.accountHeading}</h3>
      <p className="text-sm text-[#34405e]">{status}</p>
      {/* Wie de vraag bij de studiebevestiging liet staan, komt hier alsnog aan
          het aanmeldscherm. Bewust één plek om lid te worden, met een link
          ernaartoe, en niet een tweede formulier naast het eerste. */}
      <Link
        className="mt-3 inline-block text-sm font-medium text-vtk-ink underline underline-offset-4"
        href={`${prefix}/lidmaatschap`}
      >
        {pending
          ? t.pay.replace(
              "{price}",
              formatEuro(membership.priceCents, locale === "en" ? "en" : "nl"),
            )
          : canJoin
            ? t.accountJoin
            : t.accountLink}
      </Link>
    </Card>
  );
}
