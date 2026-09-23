import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { Card } from "@vtk/ui";
import { type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { currentStudyYear, formatWorkingYear } from "@/lib/workingYear";
import {
  getMembershipConfig,
  listMembers,
  membershipTotals,
  membershipYears,
} from "@/lib/membership";
import { formatEuro } from "@/lib/membership/config";
import { membershipKindLabel } from "@/lib/membership/export";
import { revokeMembershipAction } from "@/app/actions/membership";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { GrantMembershipForm } from "./GrantMembershipForm";
import { MembershipSettingsForm } from "./MembershipSettingsForm";

/**
 * Ledenbeheer: wie is er dit academiejaar lid van VTK.
 *
 * Dit is iets anders dan /admin/gebruikers (elk account op de site) en dan
 * /admin/groepen (de posten van dit werkingsjaar). Lid is een student van de
 * faculteit die zich aanmeldde, een niet-facultair lid dat betaalde, of iemand
 * die hier handmatig lid gemaakt werd.
 *
 * Het ledenaantal staat bovenaan, want dat is de vraag waarmee iemand deze
 * pagina opent; de uitsplitsing per herkomst staat ernaast zodat "hoeveel
 * betalende leden" niet apart geteld hoeft te worden.
 */
export default async function AdminLeden({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string; openstaand?: string }>;
}) {
  const [{ locale: localeParam }, filters] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("leden.manage");

  const base = nl ? "" : "/en";
  const year =
    filters.jaar && /^\d{4}$/.test(filters.jaar) ? Number(filters.jaar) : currentStudyYear();
  const pending = filters.openstaand === "1";

  const [years, totals, rows, config] = await Promise.all([
    membershipYears(),
    membershipTotals(year),
    listMembers(year, { pending }),
    getMembershipConfig(),
  ]);

  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const exportHref = `/api/admin/leden/export?jaar=${year}${pending ? "&openstaand=1" : ""}${
    nl ? "" : "&taal=en"
  }`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-vtk-ink">{nl ? "Leden" : "Members"}</h1>
        <p className="mt-1 max-w-3xl text-sm text-[#5c667f]">
          {nl
            ? "Wie dit academiejaar lid is van VTK: gratis als student van de faculteit Ingenieurswetenschappen, betalend als niet-facultair lid, of hier toegekend."
            : "Who is a member of VTK this academic year: free as a student of the Faculty of Engineering Science, paying as a non-faculty member, or granted here."}
        </p>
      </div>

      {/* Het ledenaantal zelf, met de uitsplitsing ernaast. */}
      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-[#5c667f]">
              {nl ? `Leden ${formatWorkingYear(year)}` : `Members ${formatWorkingYear(year)}`}
            </span>
            <p className="text-4xl font-semibold tabular-nums text-vtk-ink">{totals.active}</p>
            <p className="mt-1 text-sm text-[#5c667f]">
              {nl
                ? `${totals.byKind.FACULTY} gratis · ${totals.byKind.EXTERNAL} betalend · ${totals.byKind.MANUAL} toegekend`
                : `${totals.byKind.FACULTY} free · ${totals.byKind.EXTERNAL} paying · ${totals.byKind.MANUAL} granted`}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium uppercase tracking-wide text-[#5c667f]">
              {nl ? "Ontvangen" : "Received"}
            </span>
            <p className="text-2xl font-semibold tabular-nums text-vtk-ink">
              {formatEuro(totals.revenueCents, nl ? "nl" : "en")}
            </p>
            {totals.pending > 0 ? (
              <p className="mt-1 text-sm text-[#5c667f]">
                {nl
                  ? `${totals.pending} wacht${totals.pending === 1 ? "" : "en"} nog op betaling`
                  : `${totals.pending} awaiting payment`}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Per academiejaar. */}
      <Card className="p-5">
        <h2 className="mb-3 font-medium text-vtk-ink">
          {nl ? "Per academiejaar" : "By academic year"}
        </h2>
        <div className="flex flex-wrap gap-2">
          {years.map((entry) => (
            <Link
              key={entry}
              href={`${base}/admin/leden?jaar=${entry}${pending ? "&openstaand=1" : ""}`}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                entry === year
                  ? "border-vtk-ink bg-vtk-ink text-white"
                  : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/70"
              }`}
            >
              {formatWorkingYear(entry)}
            </Link>
          ))}
        </div>
      </Card>

      <MembershipSettingsForm nl={nl} config={config} />

      <Card className="p-5">
        <h2 className="mb-1 font-medium text-vtk-ink">
          {nl ? "Iemand lid maken" : "Make someone a member"}
        </h2>
        <p className="mb-3 text-sm text-[#5c667f]">
          {nl
            ? "Zonder betaling, bijvoorbeeld wie cash aan de toog betaalde of wie buiten de faculteitscheck valt."
            : "Without payment, for instance someone who paid cash at the bar or falls outside the faculty check."}
        </p>
        <GrantMembershipForm nl={nl} year={year} />
      </Card>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-medium text-vtk-ink">{nl ? "Ledenlijst" : "Member list"}</h2>
            <p className="mt-1 text-sm text-[#5c667f]">
              {nl
                ? `${rows.length} ${rows.length === 1 ? "rij" : "rijen"} in ${formatWorkingYear(year)}.`
                : `${rows.length} ${rows.length === 1 ? "row" : "rows"} in ${formatWorkingYear(year)}.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`${base}/admin/leden?jaar=${year}${pending ? "" : "&openstaand=1"}`}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                pending
                  ? "border-vtk-ink bg-vtk-ink text-white"
                  : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/70"
              }`}
            >
              {nl ? "Toon openstaande betalingen" : "Show pending payments"}
            </Link>
            <a
              href={exportHref}
              className="rounded-full border border-vtk-blue/15 px-4 py-2 text-sm font-medium text-vtk-ink transition-colors hover:bg-vtk-blue-soft/70"
            >
              {nl ? "Download Excel" : "Download Excel"}
            </a>
          </div>
        </div>

        <Card className="relative overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-[#5c667f]">
                <th className="px-4 py-3 font-medium">{nl ? "Naam" : "Name"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "R-nummer" : "R-number"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "Soort" : "Kind"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "Bedrag" : "Amount"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "Lid sinds" : "Member since"}</th>
                <th className="px-4 py-3">
                  <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.membershipId} className="border-b border-vtk-blue/10 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-vtk-ink">{row.name}</span>
                    <span className="block text-xs text-[#5c667f]">{row.email}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.rNumber ?? "-"}</td>
                  <td className="px-4 py-3">
                    {membershipKindLabel(row.kind, nl)}
                    {row.grantedByName ? (
                      <span className="block text-xs text-[#5c667f]">
                        {nl ? "door" : "by"} {row.grantedByName}
                      </span>
                    ) : null}
                    {row.note ? (
                      <span className="block text-xs text-[#5c667f]">{row.note}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.priceCents > 0 ? formatEuro(row.priceCents, nl ? "nl" : "en") : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {row.activatedAt ? (
                      dateFmt.format(row.activatedAt)
                    ) : (
                      <span className="text-[#5c667f]">
                        {nl ? "Wacht op betaling" : "Awaiting payment"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeleteIconButton
                      action={revokeMembershipAction}
                      fields={{ membershipId: row.membershipId }}
                      label={nl ? "Lidmaatschap intrekken" : "Revoke membership"}
                      srLabel={
                        nl
                          ? `Lidmaatschap intrekken: ${row.name}`
                          : `Revoke membership: ${row.name}`
                      }
                      title={nl ? "Lidmaatschap intrekken?" : "Revoke this membership?"}
                      description={
                        nl
                          ? `${row.name} telt daarna niet meer mee in het ledenaantal van ${formatWorkingYear(year)} en verliest de ledentickets. De lidmaatschappen van andere jaren blijven staan. Een betaling wordt hiermee niet terugbetaald.`
                          : `${row.name} will no longer count towards the ${formatWorkingYear(year)} member total and loses member tickets. Memberships of other years stay. This does not refund a payment.`
                      }
                      confirmLabel={nl ? "Intrekken" : "Revoke"}
                      cancelLabel={nl ? "Annuleren" : "Cancel"}
                      successMessage={nl ? "Lidmaatschap ingetrokken." : "Membership revoked."}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-[#5c667f]" colSpan={6}>
                    {nl
                      ? "Nog geen leden voor dit academiejaar."
                      : "No members for this academic year yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
