import { notFound } from "next/navigation";
import Link from "@/components/ui/Link";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getGoogleConfig } from "@/lib/google/config";
import { searchChatSpaces, type ChatSpace, type ChatSpaceOrder } from "@/lib/google/client";
import { chatErrorCode } from "@/lib/google/chatSpaces";
import { ChatSetupHelp } from "./ChatSetupHelp";

/**
 * Google Admin › Chatruimtes: de ruimtes van het domein, zoals in de Admin
 * console (Apps › Google Chat › Ruimtes beheren), maar dan hier.
 *
 * Zoeken, filteren en sorteren gebeuren bij Google (`spaces.search` met
 * beheerderstoegang), en alles staat in de URL: `?naam=`, `?extern=ja|nee`,
 * `?sorteer=leden|activiteit|gemaakt`, `?richting=op|af`. Google bladert met
 * een token en niet met een paginanummer; de tokens van de vorige pagina's
 * reizen mee in `?vorige=`, zodat "Vorige" werkt zonder iets te bewaren.
 * Op naam sorteren kan Chat niet.
 */

const PAGE_SIZE = 50;
const ORDER_PARAM: Record<string, ChatSpaceOrder> = { leden: "members", activiteit: "lastActive", gemaakt: "created" };

export default async function AdminChatSpaces({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    naam?: string;
    extern?: string;
    sorteer?: string;
    richting?: string;
    token?: string;
    vorige?: string;
  }>;
}) {
  const [{ locale: localeParam }, query] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("mailgroups.manage");

  const base = `${nl ? "" : "/en"}/admin/groepsadressen/chatruimtes`;
  const cfg = await getGoogleConfig();
  if (!cfg) {
    return (
      <p className="text-sm text-[#5c667f]">
        {nl
          ? "Google Workspace is nog niet ingesteld (Admin > IT)."
          : "Google Workspace is not set up yet (Admin > IT)."}
      </p>
    );
  }

  const name = (query.naam ?? "").trim().slice(0, 100);
  const external = query.extern === "ja" ? true : query.extern === "nee" ? false : null;
  const sortKey = query.sorteer && query.sorteer in ORDER_PARAM ? query.sorteer : "leden";
  const order = ORDER_PARAM[sortKey];
  const direction: "asc" | "desc" = query.richting === "op" ? "asc" : "desc";
  const token = query.token || undefined;
  const previous = (query.vorige ?? "").split(",").filter((entry) => entry !== "");

  let spaces: ChatSpace[] = [];
  let nextPageToken: string | null = null;
  let totalSize: number | null = null;
  let errorCode: string | null = null;
  let errorText: string | null = null;
  try {
    ({ spaces, nextPageToken, totalSize } = await searchChatSpaces(cfg, {
      name,
      external,
      order,
      direction,
      pageSize: PAGE_SIZE,
      pageToken: token,
    }));
  } catch (err) {
    errorCode = chatErrorCode(err);
    if (!errorCode) throw err;
    errorText = err instanceof Error ? err.message : String(err);
  }

  /** Een link binnen de lijst die de filters meeneemt; bladeren begint opnieuw bij een ander filter. */
  const href = (next: {
    naam?: string;
    extern?: string | null;
    sorteer?: string;
    richting?: string;
    token?: string;
    vorige?: string[];
  }) => {
    const search = new URLSearchParams();
    const n = next.naam ?? name;
    if (n) search.set("naam", n);
    const e = next.extern === undefined ? query.extern : next.extern;
    if (e === "ja" || e === "nee") search.set("extern", e);
    search.set("sorteer", next.sorteer ?? sortKey);
    search.set("richting", next.richting ?? (direction === "asc" ? "op" : "af"));
    if (next.token) search.set("token", next.token);
    if (next.vorige && next.vorige.length > 0) search.set("vorige", next.vorige.join(","));
    return `${base}?${search.toString()}`;
  };

  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const date = (value?: string) => (value ? dateFmt.format(new Date(value)) : "-");
  const pageNumber = previous.length + 1;

  const sortHeader = (key: string, label: string) => {
    const active = sortKey === key;
    const nextDirection = active ? (direction === "desc" ? "op" : "af") : "af";
    const Icon = active ? (direction === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
    const hint = nl
      ? `Sorteer op ${label.toLowerCase()}, ${nextDirection === "op" ? "oplopend" : "aflopend"}`
      : `Sort by ${label.toLowerCase()}, ${nextDirection === "op" ? "ascending" : "descending"}`;
    return (
      <th className="px-4 py-3 font-medium" aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
        <Link
          href={href({ sorteer: key, richting: nextDirection })}
          title={hint}
          aria-label={hint}
          className={`inline-flex min-h-6 items-center gap-1 uppercase tracking-wide hover:text-vtk-ink ${active ? "text-vtk-ink" : ""}`}
        >
          {label}
          <Icon aria-hidden size={13} strokeWidth={2} className={active ? "" : "opacity-60"} />
        </Link>
      </th>
    );
  };

  const field = "h-10 rounded-xl border border-vtk-blue/20 bg-white px-3 text-sm text-vtk-ink";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-vtk-ink">{nl ? "Chatruimtes" : "Chat spaces"}</h2>
        <p className="mt-1 max-w-3xl text-sm text-[#5c667f]">
          {nl
            ? "Alle ruimtes in Google Chat van het domein, ook die waar je zelf niet in zit. Open een ruimte om haar leden, groepen en rollen te beheren, haar naam te wijzigen of haar te verwijderen."
            : "Every Google Chat space of the domain, including the ones you are not in. Open a space to manage its members, groups and roles, rename it or delete it."}
        </p>
      </div>

      <form method="get" action={base} className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <label htmlFor="space-search" className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#5c667f]">
            {nl ? "Naam" : "Name"}
          </label>
          <input
            id="space-search"
            name="naam"
            type="search"
            defaultValue={name}
            placeholder={nl ? "Bv. LOKO of Revue" : "E.g. LOKO or Revue"}
            className={`${field} w-full`}
          />
        </div>
        <div>
          <label htmlFor="space-external" className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#5c667f]">
            {nl ? "Externe gebruikers" : "External users"}
          </label>
          <select id="space-external" name="extern" defaultValue={query.extern ?? ""} className={field}>
            <option value="">{nl ? "Allemaal" : "All"}</option>
            <option value="ja">{nl ? "Toegestaan" : "Allowed"}</option>
            <option value="nee">{nl ? "Niet toegestaan" : "Not allowed"}</option>
          </select>
        </div>
        <input type="hidden" name="sorteer" value={sortKey} />
        <input type="hidden" name="richting" value={direction === "asc" ? "op" : "af"} />
        <button type="submit" className="h-10 rounded-full bg-vtk-ink px-4 text-sm font-medium text-white hover:bg-vtk-navy">
          {nl ? "Zoeken" : "Search"}
        </button>
      </form>

      {errorCode ? (
        <ChatSetupHelp nl={nl} code={errorCode} detail={errorText} />
      ) : (
        <>
          <p className="text-sm text-[#5c667f]">
            {totalSize !== null
              ? nl
                ? `${totalSize} ${totalSize === 1 ? "ruimte" : "ruimtes"}${name || external !== null ? " die passen" : ""}. Pagina ${pageNumber}.`
                : `${totalSize} ${totalSize === 1 ? "space" : "spaces"}${name || external !== null ? " matching" : ""}. Page ${pageNumber}.`
              : nl
                ? `Pagina ${pageNumber}.`
                : `Page ${pageNumber}.`}
          </p>
          <div className="relative overflow-x-auto rounded-xl border border-vtk-blue/15 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-[#5c667f]">
                  <th className="px-4 py-3 font-medium">{nl ? "Naam" : "Name"}</th>
                  {sortHeader("leden", nl ? "Leden" : "Members")}
                  <th className="px-4 py-3 font-medium">{nl ? "Groepen" : "Groups"}</th>
                  <th className="px-4 py-3 font-medium">{nl ? "Extern" : "External"}</th>
                  {sortHeader("activiteit", nl ? "Laatste activiteit" : "Last activity")}
                  {sortHeader("gemaakt", nl ? "Gemaakt" : "Created")}
                </tr>
              </thead>
              <tbody>
                {spaces.map((space) => {
                  const id = space.name.replace(/^spaces\//, "");
                  return (
                    <tr key={space.name} className="border-b border-vtk-blue/10 align-top last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`${base}/${id}`} className="font-medium text-vtk-ink hover:underline">
                          {space.displayName || (nl ? "(zonder naam)" : "(unnamed)")}
                        </Link>
                        {space.spaceDetails?.description ? (
                          <span className="block text-xs text-[#5c667f]">{space.spaceDetails.description}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{space.membershipCount?.joinedDirectHumanUserCount ?? 0}</td>
                      <td className="px-4 py-3 tabular-nums">{space.membershipCount?.joinedGroupCount ?? 0}</td>
                      <td className="px-4 py-3">
                        {space.externalUserAllowed ? (nl ? "Aan" : "On") : nl ? "Uit" : "Off"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{date(space.lastActiveTime)}</td>
                      <td className="px-4 py-3 tabular-nums">{date(space.createTime)}</td>
                    </tr>
                  );
                })}
                {spaces.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-[#5c667f]">
                      {nl ? "Geen ruimtes die hierbij passen." : "No spaces match."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <nav aria-label={nl ? "Pagina's" : "Pages"} className="flex flex-wrap gap-2">
            {token ? (
              <Link
                href={href({
                  token: previous[previous.length - 1] === "-" ? undefined : previous[previous.length - 1],
                  vorige: previous.slice(0, -1),
                })}
                className="rounded-full border border-vtk-blue/15 px-4 py-2 text-sm font-medium text-vtk-ink hover:bg-vtk-blue-soft/70"
              >
                {nl ? "Vorige" : "Previous"}
              </Link>
            ) : null}
            {nextPageToken ? (
              <Link
                href={href({ token: nextPageToken, vorige: [...previous, token ?? "-"] })}
                className="rounded-full border border-vtk-blue/15 px-4 py-2 text-sm font-medium text-vtk-ink hover:bg-vtk-blue-soft/70"
              >
                {nl ? "Volgende" : "Next"}
              </Link>
            ) : null}
          </nav>
        </>
      )}
    </div>
  );
}
