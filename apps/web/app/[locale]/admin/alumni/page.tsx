import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@vtk/ui";
import { type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { brevoEnabled } from "@/lib/brevo/client";
import {
  alumniYears,
  listAlumniAccounts,
  listAlumniContacts,
  listAlumniRecipients,
} from "@/lib/alumni";
import { AlumniContactForm } from "./AlumniContactForm";
import { AlumniImport } from "./AlumniImport";
import { AlumniAccounts } from "./AlumniAccounts";
import { AlumniTable } from "./AlumniTable";
import { AlumniSyncButton } from "./SyncButton";

/**
 * Het alumni-adresboek.
 *
 * De opt-in-nieuwsbrieven hiernaast (`/admin/mailinglijsten`) zijn studiegericht
 * en vallen weg zodra iemand zijn studie niet meer bevestigt; voor een
 * afgestudeerde is dat altijd. Deze tab is de tweede bron: namen die de kring
 * van reünies en oud-praesidia overhoudt, per lichting.
 *
 * Wat naar buiten gaat, is die lijst **plus** de site-accounts die zelf
 * "hou me op de hoogte" aanvinkten, op e-mailadres ontdubbeld. Dat staat
 * bovenaan, want anders lijkt het adresboek de hele mailinglijst te zijn.
 */
export default async function AdminAlumni({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string | string[]; q?: string | string[] }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("alumni.manage");

  const sp = await searchParams;
  const yearParam = Array.isArray(sp.jaar) ? sp.jaar[0] : sp.jaar;
  const query = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;

  const [years, contacts, accounts, recipients] = await Promise.all([
    alumniYears(),
    listAlumniContacts({ year, query }),
    listAlumniAccounts({ year, query }),
    listAlumniRecipients({ year }),
  ]);

  const syncOn = brevoEnabled();
  const base = nl ? "" : "/en";
  const exportHref = `/api/admin/alumni/export${year ? `?jaar=${year}` : ""}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-vtk-ink">{nl ? "Alumni" : "Alumni"}</h1>
        <p className="mt-1 max-w-3xl text-sm text-[#5c667f]">
          {nl
            ? "Twee bronnen die bij een export samenkomen: het adresboek per lichting voor alumni zonder account, en de leden die op de site aanvinkten dat ze alumni-mails willen. Dubbele adressen vallen weg, en het account wint."
            : "Two sources that come together on export: the address book by year for alumni without an account, and the members who ticked on the site that they want alumni mail. Duplicate addresses are dropped, and the account wins."}
        </p>
      </div>

      {/* Wat er effectief vertrekt, en waarheen. Bovenaan, want dat is de vraag
          waarmee iemand deze pagina opent. */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="font-medium text-vtk-ink">
              {year
                ? nl
                  ? `Mailinglijst lichting ${year}`
                  : `Mailing list, class of ${year}`
                : nl
                  ? "Volledige mailinglijst"
                  : "Full mailing list"}
            </h2>
            <p className="mt-1 text-sm text-[#5c667f]">
              {nl
                ? `${recipients.length} ontvanger${recipients.length === 1 ? "" : "s"}: ${recipients.filter((r) => r.source === "contact").length} uit het adresboek en ${recipients.filter((r) => r.source === "account").length} met een account op de site.`
                : `${recipients.length} recipient${recipients.length === 1 ? "" : "s"}: ${recipients.filter((r) => r.source === "contact").length} from the address book and ${recipients.filter((r) => r.source === "account").length} with a site account.`}
            </p>
            {!syncOn && (
              <p className="mt-2 text-xs text-[#5c667f]">
                {nl
                  ? "Brevo is niet ingesteld (geen BREVO_KEY). De CSV-download werkt wel."
                  : "Brevo is not configured (no BREVO_KEY). The CSV download does work."}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={exportHref}
              className="rounded-full border border-vtk-blue/15 px-4 py-2 text-sm font-medium text-vtk-ink transition-colors hover:bg-vtk-blue-soft/70"
            >
              {nl ? "Download CSV" : "Download CSV"}
            </a>
            <AlumniSyncButton locale={locale} enabled={syncOn} />
          </div>
        </div>
      </Card>

      {/* Per lichting: het overzicht én de filter. Beide bronnen apart, zodat een
          leeg jaar zichtbaar het verschil toont tussen "niemand" en "nog niet
          ingevoerd". */}
      <Card className="p-5">
        <h2 className="mb-3 font-medium text-vtk-ink">{nl ? "Per lichting" : "By year"}</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${base}/admin/alumni`}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              year === null
                ? "border-vtk-ink bg-vtk-ink text-white"
                : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/70"
            }`}
          >
            {nl ? "Alle" : "All"}
          </Link>
          {years.map((row) => (
            <Link
              key={row.year ?? "onbekend"}
              href={
                row.year ? `${base}/admin/alumni?jaar=${row.year}` : `${base}/admin/alumni`
              }
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                year === row.year
                  ? "border-vtk-ink bg-vtk-ink text-white"
                  : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/70"
              }`}
            >
              {row.year ?? (nl ? "Geen jaar" : "No year")}{" "}
              <span className="opacity-70">
                {row.contacts + row.accounts}
              </span>
            </Link>
          ))}
          {years.length === 0 && (
            <span className="text-sm text-[#5c667f]">
              {nl ? "Nog geen lichtingen." : "No years yet."}
            </span>
          )}
        </div>
      </Card>

      <AlumniContactForm locale={locale} />
      <AlumniImport locale={locale} />

      <div>
        <form className="mb-3 flex flex-wrap items-end gap-3" action={`${base}/admin/alumni`}>
          {year ? <input type="hidden" name="jaar" value={year} /> : null}
          <div>
            <label
              htmlFor="alumni-search"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#5c667f]"
            >
              {nl ? "Zoeken" : "Search"}
            </label>
            <input
              id="alumni-search"
              name="q"
              defaultValue={query}
              placeholder={nl ? "Naam of e-mailadres" : "Name or email address"}
              className="w-56 rounded-xl border border-vtk-blue/15 bg-white px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-full border border-vtk-blue/15 px-4 py-2 text-sm font-medium text-vtk-ink transition-colors hover:bg-vtk-blue-soft/70"
          >
            {nl ? "Filteren" : "Filter"}
          </button>
        </form>

        <div className="space-y-2">
          <h2 className="font-medium text-vtk-ink">
            {nl ? "Adresboek (zonder account)" : "Address book (no account)"}
          </h2>
          <AlumniTable rows={contacts} locale={locale} />
        </div>

        <div className="mt-6">
          <AlumniAccounts accounts={accounts} locale={locale} />
        </div>
      </div>
    </div>
  );
}
