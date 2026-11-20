import Link from "@/components/ui/Link";
import { Card } from "@vtk/ui";
import {
  honoraryTotals,
  listHonoraryMembers,
  membershipYears,
  type HonoraryKindFilter,
} from "@/lib/membership";
import { formatEuro } from "@/lib/membership/config";
import { DEFAULT_HONORARY_SORT, memberSortParams, type MemberSort } from "@/lib/membership/sort";
import { formatWorkingYear } from "@/lib/workingYear";
import { revokeHonoraryAction, revokeMembershipAction } from "@/app/actions/membership";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { GrantHonoraryForm } from "./GrantHonoraryForm";
import { MemberSearch } from "./MemberSearch";
import { SortLinkHeader } from "./SortLinkHeader";

/**
 * Het tabblad Ereleden op /admin/leden.
 *
 * Twee soorten ereleden in één lijst: **gratis** (door een beheerder gezet met
 * `User.honoraryMember`, blijvend tot het hier ingetrokken wordt) en
 * **betalend** (zelf betaald op /lidmaatschap, een `Membership` van soort
 * `HONORARY` voor één academiejaar). Daarom staat hier wel een jaarkeuze: ze
 * bepaalt welke betalende ereleden je ziet; de gratis staan er elk jaar.
 *
 * Zoeken (`?zoek=`), de soort (`?soort=gratis|betalend`) en de sortering
 * (`?sorteer=`) staan in de URL, zoals bij de leden.
 */
export async function HonoraryList({
  nl,
  base,
  year,
  query,
  kind,
  sort,
}: {
  nl: boolean;
  base: string;
  year: number;
  query: string;
  kind: HonoraryKindFilter | null;
  sort: MemberSort;
}) {
  const [rows, totals, years] = await Promise.all([
    listHonoraryMembers(year, { query, kind, sort }),
    honoraryTotals(year),
    membershipYears(),
  ]);
  const yearLabel = formatWorkingYear(year);
  const filtered = query !== "" || kind !== null;
  const locale = nl ? "nl" : "en";

  const listHref = (
    next: { jaar?: number; soort?: HonoraryKindFilter | null; sort?: MemberSort } = {},
  ) => {
    const search = new URLSearchParams({ jaar: String(next.jaar ?? year) });
    const soort = next.soort === undefined ? kind : next.soort;
    if (soort) search.set("soort", soort);
    if (query) search.set("zoek", query);
    for (const [key, value] of Object.entries(memberSortParams(next.sort ?? sort, DEFAULT_HONORARY_SORT))) {
      search.set(key, value);
    }
    return `${base}/admin/leden/ereleden?${search.toString()}`;
  };

  const chips: { key: HonoraryKindFilter | null; label: string; count: number }[] = [
    { key: null, label: nl ? "Alle" : "All", count: totals.total },
    { key: "gratis", label: nl ? "Gratis" : "Free", count: totals.granted },
    { key: "betalend", label: nl ? "Betalend" : "Paying", count: totals.paid },
  ];
  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm transition-colors ${
      active
        ? "border-vtk-ink bg-vtk-ink text-white"
        : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/70"
    }`;
  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const word = (count: number) =>
    nl ? (count === 1 ? "erelid" : "ereleden") : count === 1 ? "honorary member" : "honorary members";

  return (
    <>
      <Card className="p-5">
        <h2 className="mb-1 font-medium text-vtk-ink">
          {nl ? "Iemand gratis erelid maken" : "Make someone a free honorary member"}
        </h2>
        <p className="mb-3 max-w-3xl text-sm text-[#5c667f]">
          {nl
            ? "Een erelid telt als lid en ziet ticketsoorten met doelgroep “Alleen ereleden”. Voor alle andere bezoekers bestaan die soorten niet: ze staan niet in de lijst en de kassa weigert ze. Wie je hier erelid maakt, blijft dat tot het hier ingetrokken wordt, ook over academiejaren heen. Wie geen student is, kan ook zelf betalend erelid worden op /lidmaatschap, voor één academiejaar (de prijs staat bij Instellingen)."
            : "An honorary member counts as a member and sees ticket types with the “Honorary members only” audience. For every other visitor those types do not exist: they are not listed, and checkout refuses them. Someone you make an honorary member here stays one until it is revoked here, across academic years. People who are not a student can also become a paying honorary member themselves on /lidmaatschap, for one academic year (the price is under Settings)."}
        </p>
        <GrantHonoraryForm nl={nl} />
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-medium text-vtk-ink">
          {nl ? "Per academiejaar" : "By academic year"}
        </h2>
        <p className="mb-3 text-sm text-[#5c667f]">
          {nl
            ? "Een betalend erelidmaatschap geldt voor één academiejaar. De gratis ereleden staan er elk jaar bij."
            : "A paid honorary membership lasts one academic year. The free honorary members are listed every year."}
        </p>
        <div className="flex flex-wrap gap-2">
          {years.map((entry) => (
            <Link
              key={entry}
              href={listHref({ jaar: entry })}
              aria-current={entry === year ? "page" : undefined}
              className={chipClass(entry === year)}
            >
              {formatWorkingYear(entry)}
            </Link>
          ))}
        </div>
      </Card>

      <div className="space-y-3">
        <div>
          <h2 className="font-medium text-vtk-ink">{nl ? "Ereleden" : "Honorary members"}</h2>
          <p className="mt-1 text-sm text-[#5c667f]">
            {filtered
              ? nl
                ? `${rows.length} van de ${totals.total} ${word(totals.total)} in ${yearLabel}.`
                : `${rows.length} of ${totals.total} ${word(totals.total)} in ${yearLabel}.`
              : nl
                ? `${rows.length} ${word(rows.length)} in ${yearLabel}: ${totals.granted} gratis, ${totals.paid} betalend.`
                : `${rows.length} ${word(rows.length)} in ${yearLabel}: ${totals.granted} free, ${totals.paid} paying.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MemberSearch
            key={`ereleden-${year}`}
            initialQuery={query}
            placeholder={nl ? "Zoek op naam, e-mail of r-nummer" : "Search by name, email or r-number"}
            ariaLabel={nl ? "Ereleden zoeken" : "Search honorary members"}
          />
          <nav aria-label={nl ? "Soort erelid" : "Kind of honorary member"} className="flex flex-wrap gap-2">
            {chips.map((chip) => {
              const active = chip.key === kind;
              return (
                <Link
                  key={chip.key ?? "alle"}
                  href={listHref({ soort: chip.key })}
                  aria-current={active ? "page" : undefined}
                  className={chipClass(active)}
                >
                  {chip.label} <span className="tabular-nums opacity-70">{chip.count}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <Card className="relative overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-[#5c667f]">
                <SortLinkHeader nl={nl} label={nl ? "Naam" : "Name"} sortKey="naam" sort={sort} href={(next) => listHref({ sort: next })} />
                <SortLinkHeader nl={nl} label={nl ? "R-nummer" : "R-number"} sortKey="rnummer" sort={sort} href={(next) => listHref({ sort: next })} />
                <SortLinkHeader nl={nl} label={nl ? "Soort" : "Kind"} sortKey="soort" sort={sort} href={(next) => listHref({ sort: next })} />
                <SortLinkHeader nl={nl} label={nl ? "Bedrag" : "Amount"} sortKey="bedrag" sort={sort} href={(next) => listHref({ sort: next })} />
                <SortLinkHeader nl={nl} label={nl ? "Betaald op" : "Paid on"} sortKey="datum" sort={sort} href={(next) => listHref({ sort: next })} />
                <th className="px-4 py-3">
                  <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId} className="border-b border-vtk-blue/10 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-vtk-ink">{row.name}</span>
                    <span className="block text-xs text-[#5c667f]">{row.email}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.rNumber ?? "-"}</td>
                  <td className="px-4 py-3">
                    {row.granted ? <span className="block">{nl ? "Gratis" : "Free"}</span> : null}
                    {row.paid ? (
                      <span className="block">
                        {nl ? `Betalend, ${yearLabel}` : `Paying, ${yearLabel}`}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.paid ? formatEuro(row.paid.priceCents, locale) : "-"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.paid ? dateFmt.format(row.paid.activatedAt) : "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      {row.granted ? (
                        <DeleteIconButton
                          action={revokeHonoraryAction}
                          fields={{ userId: row.userId }}
                          label={nl ? "Gratis erelidmaatschap intrekken" : "Revoke free honorary membership"}
                          srLabel={
                            nl
                              ? `Gratis erelidmaatschap intrekken: ${row.name}`
                              : `Revoke free honorary membership: ${row.name}`
                          }
                          title={nl ? "Erelidmaatschap intrekken?" : "Revoke honorary membership?"}
                          description={
                            row.paid
                              ? nl
                                ? `${row.name} is daarna geen blijvend erelid meer, maar blijft betalend erelid tot het einde van ${yearLabel}. Het account en tickets die al gekocht zijn, blijven staan.`
                                : `${row.name} is no longer a permanent honorary member, but stays a paying honorary member until the end of ${yearLabel}. The account and tickets already bought stay.`
                              : nl
                                ? `${row.name} ziet daarna geen ticketsoorten voor ereleden meer. Het account, een lidmaatschap van de kring en tickets die al gekocht zijn, blijven staan.`
                                : `${row.name} will no longer see ticket types for honorary members. The account, a VTK membership and tickets already bought stay.`
                          }
                          confirmLabel={nl ? "Intrekken" : "Revoke"}
                          cancelLabel={nl ? "Annuleren" : "Cancel"}
                          successMessage={nl ? "Erelidmaatschap ingetrokken." : "Honorary membership revoked."}
                        />
                      ) : null}
                      {row.paid ? (
                        <DeleteIconButton
                          action={revokeMembershipAction}
                          fields={{ membershipId: row.paid.membershipId }}
                          label={nl ? "Betalend erelidmaatschap intrekken" : "Revoke paid honorary membership"}
                          srLabel={
                            nl
                              ? `Betalend erelidmaatschap intrekken: ${row.name}`
                              : `Revoke paid honorary membership: ${row.name}`
                          }
                          title={nl ? "Betalend erelidmaatschap intrekken?" : "Revoke this paid honorary membership?"}
                          description={
                            nl
                              ? `Het erelidmaatschap van ${row.name} voor ${yearLabel} verdwijnt, met de betaling eraan, uit het ledenaantal en de ontvangsten.${row.granted ? " Het gratis erelidmaatschap blijft staan." : ""} Lidmaatschappen van andere jaren en tickets die al gekocht zijn, blijven staan. De ${formatEuro(row.paid.priceCents, locale)} wordt hiermee niet terugbetaald; doe dat eerst bij Mollie.`
                              : `The ${yearLabel} honorary membership of ${row.name} disappears, with its payment, from the member total and the revenue.${row.granted ? " The free honorary membership stays." : ""} Memberships of other years and tickets already bought stay. This does not refund the ${formatEuro(row.paid.priceCents, locale)}; do that at Mollie first.`
                          }
                          confirmLabel={nl ? "Intrekken" : "Revoke"}
                          cancelLabel={nl ? "Annuleren" : "Cancel"}
                          successMessage={nl ? "Erelidmaatschap ingetrokken." : "Honorary membership revoked."}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-[#5c667f]" colSpan={6}>
                    {filtered
                      ? nl
                        ? "Geen ereleden die passen bij deze zoekterm of soort."
                        : "No honorary members match this search or kind."
                      : nl
                        ? "Nog geen ereleden."
                        : "No honorary members yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
