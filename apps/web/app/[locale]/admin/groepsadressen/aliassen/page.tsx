import { notFound } from "next/navigation";
import Link from "@/components/ui/Link";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getGoogleConfig } from "@/lib/google/config";
import { directoryAddresses, recipientsOf, type DirectoryAddresses } from "@/lib/google/aliases";
import { normaliseAddress, type RecipientNode } from "@/lib/google/recipients";
import { AddAliasForm, AliasTable, type AliasRowView } from "./AliasManager";

/**
 * Google Admin › Aliassen: opzoeken wie een mail krijgt, en de aliassen van
 * groepen en accounts beheren.
 *
 * Opzoeken klapt een groep recursief uit tot op de postbussen (een groep in
 * een groep in een groep), met per postbus langs welke groepen de mail er komt.
 * Het adres en de zoekterm staan in de URL (`?adres=`, `?zoek=`), zodat je een
 * antwoord kan doorsturen. Zie docs/google-workspace.md, "Aliassen".
 */
export default async function AdminGoogleAliases({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ adres?: string; zoek?: string }>;
}) {
  const [{ locale: localeParam }, query] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("mailgroups.manage");

  const base = `${nl ? "" : "/en"}/admin/groepsadressen/aliassen`;
  const cfg = await getGoogleConfig();
  if (!cfg) {
    return (
      <p className="text-sm text-[#5c667f]">
        {nl
          ? "Google Workspace is nog niet ingesteld (Admin > IT). Zonder koppeling kan de directory niet uitgelezen worden."
          : "Google Workspace is not set up yet (Admin > IT). Without it the directory cannot be read."}
      </p>
    );
  }

  // Google onbereikbaar is verwacht: een leesbare melding, geen error boundary.
  let directory: DirectoryAddresses | null = null;
  let error: string | null = null;
  try {
    directory = await directoryAddresses(cfg);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const address = normaliseAddress(query.adres ?? "", cfg.domain);
  const search = (query.zoek ?? "").trim().toLowerCase().slice(0, 100);
  const owner = address && directory ? (directory.byAddress.get(address) ?? null) : null;
  const expansion = owner ? await recipientsOf(cfg, owner) : null;

  const lookupHref = (value: string) => {
    const params = new URLSearchParams({ adres: value });
    if (search) params.set("zoek", search);
    return `${base}?${params.toString()}#ontvangers`;
  };

  const rows: AliasRowView[] = (directory?.aliases ?? [])
    .filter(
      (row) =>
        !search ||
        row.alias.toLowerCase().includes(search) ||
        row.owner.email.toLowerCase().includes(search) ||
        row.owner.name.toLowerCase().includes(search),
    )
    .map((row) => ({
      alias: row.alias,
      ownerEmail: row.owner.email,
      ownerName: row.owner.name,
      ownerKind: row.owner.kind,
      ownerSuspended: row.owner.suspended,
      managedBySite: row.owner.managedBySite,
      kiesploeg: row.kiesploeg,
    }));
  const owners = (directory?.owners ?? []).map((o) => ({ email: o.email, name: o.name }));
  const groupAliases = directory?.aliases.filter((row) => row.owner.kind === "group").length ?? 0;
  const userAliases = (directory?.aliases.length ?? 0) - groupAliases;
  const field =
    "h-10 w-full rounded-xl border border-vtk-blue/20 bg-white px-3 text-sm text-vtk-ink";

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <p className="font-medium">{nl ? "Google gaf geen antwoord" : "Google did not answer"}</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}

      <section className="space-y-3 scroll-mt-28" aria-labelledby="ontvangers-heading" id="ontvangers">
        <div>
          <h2 id="ontvangers-heading" className="text-lg font-semibold text-vtk-ink">
            {nl ? "Wie krijgt de mail?" : "Who gets the mail?"}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-[#5c667f]">
            {nl
              ? `Tik een adres in, een hoofdadres of een alias, van een groep of een account. Een groep wordt helemaal uitgeklapt: zit er een groep in, dan ook die, tot op de postbussen die de mail echt krijgen.`
              : `Enter an address, a primary address or an alias, of a group or an account. A group is fully expanded: groups inside it too, down to the mailboxes that actually receive the mail.`}
          </p>
        </div>
        <form method="get" action={base} className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1">
            <label htmlFor="lookup-address" className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#5c667f]">
              {nl ? "Adres" : "Address"}
            </label>
            <input
              id="lookup-address"
              name="adres"
              defaultValue={query.adres ?? ""}
              placeholder={`loko-av@${cfg.domain}`}
              className={field}
              autoComplete="off"
            />
          </div>
          {search ? <input type="hidden" name="zoek" value={search} /> : null}
          <button
            type="submit"
            className="h-10 rounded-full bg-vtk-ink px-4 text-sm font-medium text-white hover:bg-vtk-navy"
          >
            {nl ? "Opzoeken" : "Look up"}
          </button>
        </form>

        {address && directory && !owner ? (
          <p className="rounded-xl border border-vtk-blue/15 bg-white px-4 py-3 text-sm text-vtk-ink">
            {nl
              ? `${address} hoort bij geen groep en geen account van ${cfg.domain}. Mail ernaartoe komt niet aan.`
              : `${address} belongs to no group and no account of ${cfg.domain}. Mail sent there bounces.`}
          </p>
        ) : null}

        {owner ? (
          <div className="space-y-4 rounded-xl border border-vtk-blue/15 bg-white p-4">
            <p className="text-sm text-vtk-ink">
              <strong>{address}</strong>{" "}
              {owner.email.toLowerCase() === address
                ? nl
                  ? `is het hoofdadres van ${owner.kind === "group" ? "de groep" : "het account"} ${owner.name}.`
                  : `is the primary address of the ${owner.kind === "group" ? "group" : "account"} ${owner.name}.`
                : nl
                  ? `is een alias van ${owner.kind === "group" ? "de groep" : "het account"} ${owner.name} (${owner.email}).`
                  : `is an alias of the ${owner.kind === "group" ? "group" : "account"} ${owner.name} (${owner.email}).`}
              {owner.aliases.length > 0 ? (
                <span className="block text-xs text-[#5c667f]">
                  {nl ? "Alle aliassen: " : "All aliases: "}
                  {owner.aliases.join(", ")}
                </span>
              ) : null}
            </p>

            {owner.kind === "user" ? (
              <p className="text-sm text-[#5c667f]">
                {owner.suspended
                  ? nl
                    ? "Dit account is geschorst: mail ernaartoe komt niet aan."
                    : "This account is suspended: mail sent to it does not arrive."
                  : nl
                    ? "Een account is zijn eigen postbus: de mail komt daar aan (en waar het lid ze eventueel zelf naar doorstuurt)."
                    : "An account is its own mailbox: the mail arrives there (and wherever the member forwards it)."}
              </p>
            ) : expansion ? (
              <>
                <p className="text-sm text-vtk-ink">
                  {nl
                    ? `${expansion.mailboxes.length} ${expansion.mailboxes.length === 1 ? "postbus krijgt" : "postbussen krijgen"} deze mail, via ${expansion.groupCount} ${expansion.groupCount === 1 ? "groep" : "groepen"}${expansion.depth > 0 ? `, tot ${expansion.depth} ${expansion.depth === 1 ? "niveau" : "niveaus"} diep` : ""}.`
                    : `${expansion.mailboxes.length} ${expansion.mailboxes.length === 1 ? "mailbox gets" : "mailboxes get"} this mail, through ${expansion.groupCount} ${expansion.groupCount === 1 ? "group" : "groups"}${expansion.depth > 0 ? `, up to ${expansion.depth} ${expansion.depth === 1 ? "level" : "levels"} deep` : ""}.`}
                  {expansion.cycles > 0
                    ? nl
                      ? " Er zit een lus in: een groep bevat (via een omweg) zichzelf. Google bezorgt toch maar één keer."
                      : " There is a loop: a group contains itself (indirectly). Google still delivers only once."
                    : ""}
                </p>
                <div className="relative overflow-x-auto rounded-xl border border-vtk-blue/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-[#5c667f]">
                        <th className="px-4 py-2 font-medium">{nl ? "Postbus" : "Mailbox"}</th>
                        <th className="px-4 py-2 font-medium">{nl ? "Soort" : "Kind"}</th>
                        <th className="px-4 py-2 font-medium">{nl ? "Via" : "Via"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expansion.mailboxes.map((mailbox) => {
                        const account = directory?.byAddress.get(mailbox.email.toLowerCase());
                        return (
                          <tr key={mailbox.email} className="border-b border-vtk-blue/10 last:border-0">
                            <td className="px-4 py-2">
                              <span className="text-vtk-ink">{mailbox.email}</span>
                              {account && account.kind === "user" ? (
                                <span className="block text-xs text-[#5c667f]">
                                  {account.name}
                                  {account.suspended ? (nl ? " · geschorst, krijgt niets" : " · suspended, gets nothing") : ""}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-2 text-[#5c667f]">
                              {mailbox.type === "EXTERNAL"
                                ? nl ? "Extern" : "External"
                                : mailbox.type === "CUSTOMER"
                                  ? nl ? "Iedereen in het domein" : "Everyone in the domain"
                                  : nl ? "Account" : "Account"}
                            </td>
                            <td className="px-4 py-2 text-xs text-[#5c667f]">{mailbox.via.join(" › ")}</td>
                          </tr>
                        );
                      })}
                      {expansion.mailboxes.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-4 text-center text-[#5c667f]">
                            {nl ? "Niemand: deze groep heeft (nog) geen leden." : "Nobody: this group has no members (yet)."}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-vtk-ink">
                    {nl ? "De structuur van de groepen" : "The structure of the groups"}
                  </summary>
                  <div className="mt-2 rounded-xl bg-[var(--paper)] p-3">
                    <Tree node={expansion.root} nl={nl} lookupHref={lookupHref} />
                  </div>
                </details>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-3" aria-labelledby="aliassen-heading">
        <div>
          <h2 id="aliassen-heading" className="text-lg font-semibold text-vtk-ink">
            {nl ? "Aliassen" : "Aliases"}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-[#5c667f]">
            {nl
              ? `Extra adressen die bij een groep of een account horen: mail naar de alias komt aan op het hoofdadres. ${groupAliases} op groepen, ${userAliases} op accounts. Een wijziging gaat meteen naar Google, dat er soms een paar minuten over doet.`
              : `Extra addresses belonging to a group or an account: mail to the alias arrives at the primary address. ${groupAliases} on groups, ${userAliases} on accounts. A change goes straight to Google, which sometimes takes a few minutes.`}
          </p>
        </div>
        <div className="rounded-xl border border-vtk-blue/15 bg-white p-4">
          <AddAliasForm nl={nl} domain={cfg.domain} owners={owners} defaultOwner={owner?.email} />
        </div>
        <form method="get" action={base} className="flex flex-wrap items-end gap-2">
          {query.adres ? <input type="hidden" name="adres" value={query.adres} /> : null}
          <div className="min-w-64 flex-1">
            <label htmlFor="alias-search" className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#5c667f]">
              {nl ? "Zoek in de aliassen" : "Search the aliases"}
            </label>
            <input
              id="alias-search"
              name="zoek"
              type="search"
              defaultValue={search}
              placeholder={nl ? "Alias, groep of naam" : "Alias, group or name"}
              className={field}
            />
          </div>
          <button
            type="submit"
            className="h-10 rounded-full border border-vtk-blue/15 px-4 text-sm font-medium text-vtk-ink hover:bg-vtk-blue-soft/70"
          >
            {nl ? "Zoeken" : "Search"}
          </button>
        </form>
        <p className="text-sm text-[#5c667f]">
          {search
            ? nl
              ? `${rows.length} van de ${directory?.aliases.length ?? 0} aliassen.`
              : `${rows.length} of ${directory?.aliases.length ?? 0} aliases.`
            : nl
              ? `${rows.length} aliassen.`
              : `${rows.length} aliases.`}
        </p>
        <AliasTable nl={nl} rows={rows} owners={owners} lookupBase={base} search={search} />
      </section>
    </div>
  );
}

/** De boom van groepen, met elke groep als link om haar apart op te zoeken. */
function Tree({
  node,
  nl,
  lookupHref,
}: {
  node: RecipientNode;
  nl: boolean;
  lookupHref: (address: string) => string;
}) {
  const note = node.cycle
    ? nl ? "lus: staat hoger al, niet nog eens uitgeklapt" : "loop: already above, not expanded again"
    : node.repeated
      ? nl ? "staat hierboven al uitgeklapt" : "already expanded above"
      : node.unreadable
        ? nl ? "leden niet leesbaar" : "members not readable"
        : null;
  return (
    <div>
      <Link href={lookupHref(node.email)} className="font-medium text-vtk-ink underline-offset-2 hover:underline">
        {node.email}
      </Link>
      {note ? <span className="ml-2 text-xs text-[#5c667f]">({note})</span> : null}
      {node.children && node.children.length > 0 ? (
        <ul className="ml-3 mt-1 space-y-1 border-l border-vtk-blue/15 pl-3">
          {node.children.map((child) => (
            <li key={`${child.type}:${child.email}`}>
              {child.type === "GROUP" ? (
                <Tree node={child} nl={nl} lookupHref={lookupHref} />
              ) : (
                <span className="text-[#34405e]">{child.email}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
