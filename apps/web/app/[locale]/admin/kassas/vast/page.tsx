import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { hasLocale } from "@/lib/locale";
import { formatWorkingYear } from "@/lib/workingYear";
import { formatDayMonth, formatEuro, formatSpentOn, toDateInputValue } from "@/lib/rekeningen/expenses";
import {
  brusselsToday,
  canEditPermanentEntry,
  cashRegisterAccess,
  getCashRegisterConfig,
  permanentPostsFor,
  permanentTabLabel,
} from "@/lib/kassas/server";
import {
  daysBetween,
  entryValueCents,
  isCheckpoint,
  lastClosedQuarter,
  ledgerYearOf,
  ledgerYearQuarters,
  ledgerYearResultCents,
  POST_COUNT_WINDOW_DAYS,
  postSlug,
  quarterEnd,
  quarterEndLabel,
  quarterLabel,
  quarterOf,
  quarterResult,
  quarterShort,
  quarterStart,
  resultsPerCheckpoint,
  sortEntries,
  type PermanentEntryKind,
} from "@/lib/kassas/permanent";
import { savePermanentEntryAction } from "@/app/actions/kassas";
import { KassaNav } from "../KassaNav";
import { kassaErrorMessages } from "../messages";
import { EntryForm } from "./EntryForm";
import { ManagerActions } from "./ManagerActions";

type SearchParams = { post?: string; jaar?: string };

/**
 * Het kasboek van een vaste kassa (Cursusdienst, Theokot, Fakbar): wat Beheer
 * meegaf en terugkreeg, wat de post telde, en per kwartaal de winst. Beheer
 * ziet de drie posten en geeft de bewegingen in; de post telt hier haar kassa
 * en ziet haar eigen kasboek, zonder de winst (zie docs/design-decisions.md).
 */
export default async function VasteKassas({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const access = await cashRegisterAccess(`${base}/inloggen?next=${base}/admin/kassas/vast`);
  if (!access.canRequest) {
    return (
      <p className="text-sm text-vtk-muted">
        {nl
          ? "Je hebt geen toegang tot de kassa's. Vraag IT om het recht 'Een kassa aanvragen' aan je rol te hangen."
          : "You do not have access to the cash registers. Ask IT to add the 'Request a cash register' permission to your role."}
      </p>
    );
  }
  const manage = access.canManage;
  const posts = await permanentPostsFor(access);
  const nav = (
    <KassaNav
      base={base}
      nl={nl}
      active="vast"
      caps={{ request: true, manage, control: access.canCheckIncome }}
      permanentLabel={permanentTabLabel(access, locale)}
    />
  );
  const heading = (
    <header>
      <h1 className="text-2xl font-semibold">{nl ? "Kassa's" : "Cash registers"}</h1>
      <p className="mt-1 max-w-5xl text-sm text-vtk-muted">
        {manage
          ? nl
            ? "De kassa's van Cursusdienst, Theokot en Fakbar blijven het hele semester bij de post. Hier staat wat Beheer meegaf en terugkreeg, wat de post telde, en de winst die daaruit volgt."
            : "The Cursusdienst, Theokot and Fakbar registers stay with the post all semester. Here is what Administration handed out and got back, what the post counted, and the profit that follows."
          : nl
            ? "Jullie kassa blijft het hele semester bij jullie. Tel ze wanneer Beheer erom vraagt, en zeker op het einde van elk kwartaal: Beheer rekent er de winst van het kwartaal mee uit."
            : "Your register stays with you all semester. Count it when Administration asks, and at least at the end of every quarter: Administration uses it to work out the quarter's profit."}
      </p>
    </header>
  );

  if (posts.length === 0) {
    return (
      <div className="space-y-5">
        {heading}
        {nav}
        <p className="rounded-2xl border border-vtk-blue/12 bg-white p-5 text-sm text-vtk-body">
          {nl
            ? "Enkel Cursusdienst, Theokot en Fakbar hebben een vaste kassa. Heeft je post een kassa nodig voor een activiteit, vraag ze dan aan bij Kassa aanvragen."
            : "Only Cursusdienst, Theokot and Fakbar have a permanent register. If your post needs a register for an activity, request one under Request a register."}
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const post = posts.find((candidate) => postSlug(candidate.code) === sp.post) ?? posts[0];
  const postName = pick(post.nameNl, post.nameEn, locale);
  const today = brusselsToday();
  const todayValue = toDateInputValue(today);

  const [entries, config] = await Promise.all([
    prisma.permanentCashEntry.findMany({
      where: { groupId: post.id },
      include: { createdBy: { select: { name: true } } },
    }),
    getCashRegisterConfig(),
  ]);
  const sorted = sortEntries(entries);
  const perCheckpoint = resultsPerCheckpoint(sorted);
  const errorMessages = kassaErrorMessages(locale);
  const euro = (cents: number) => formatEuro(cents, locale);
  const dayMonth = (date: Date) => formatDayMonth(date, "UTC", locale);

  // Het kasboekjaar loopt van juli tot juni. Enkel jaren met regels en het
  // lopende jaar krijgen een tab: dit kasboek begon in oktober 2026.
  const currentYear = ledgerYearOf(today);
  const years = [...new Set([currentYear, ...sorted.map((entry) => ledgerYearOf(entry.date))])].sort((a, b) => b - a);
  const year = years.includes(Number(sp.jaar)) ? Number(sp.jaar) : currentYear;
  const firstDate = sorted[0]?.date ?? today;
  // Een kwartaal van voor het kasboek begon, heeft niets te zeggen.
  const quarters = ledgerYearQuarters(year)
    .filter((quarter) => quarterStart(quarter) <= today && quarterEnd(quarter) >= firstDate)
    .reverse();

  const hrefWith = (patch: Partial<SearchParams>) => {
    const query = new URLSearchParams();
    const values: Record<string, string> = {
      post: posts.length > 1 ? postSlug(post.code) : "",
      jaar: year === currentYear ? "" : String(year),
      ...patch,
    };
    for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
    const qs = query.toString();
    return `${base}/admin/kassas/vast${qs ? `?${qs}` : ""}`;
  };

  // De kerncijfers bovenaan.
  const checkpoints = sorted.filter(isCheckpoint);
  const lastCheckpoint = checkpoints.at(-1) ?? null;
  const closedQuarter = lastClosedQuarter(today);
  const closedResult = quarterResult(sorted, closedQuarter, today);
  const currentQuarter = quarterOf(today);
  const ago = (days: number) =>
    days === 0
      ? nl
        ? "vandaag"
        : "today"
      : days === 1
        ? nl
          ? "gisteren"
          : "yesterday"
        : nl
          ? `${days} dagen geleden`
          : `${days} days ago`;
  const facts: Array<{ label: string; value: string; sub: string; warn?: boolean }> = [
    {
      label: nl ? "Laatste telling" : "Last count",
      value: lastCheckpoint ? euro(lastCheckpoint.kind === "COUNT" ? entryValueCents(lastCheckpoint) : 0) : nl ? "Nog geen" : "None yet",
      sub: lastCheckpoint
        ? `${lastCheckpoint.kind === "COUNT" ? "" : nl ? "Volledig terug, " : "Fully returned, "}${formatSpentOn(lastCheckpoint.date, locale)}, ${ago(daysBetween(lastCheckpoint.date, today))}`
        : nl
          ? "Sinds de start van het kasboek"
          : "Since the ledger started",
    },
  ];
  if (manage) {
    const beforeLedger = quarterEnd(closedQuarter) < firstDate || sorted.length === 0;
    facts.push(
      {
        label: `${nl ? "Winst" : "Profit"} ${quarterShort(closedQuarter)}`,
        value:
          closedResult.state === "done"
            ? euro(closedResult.resultCents)
            : beforeLedger
              ? "-"
              : nl
                ? "Geen telling"
                : "No count",
        sub:
          closedResult.state === "done"
            ? `${nl ? "Tot de telling van" : "Up to the count of"} ${formatSpentOn(closedResult.closing.date, locale)}`
            : beforeLedger
              ? nl
                ? "Het kasboek begon later"
                : "The ledger started later"
              : nl
                ? "Op het einde van het kwartaal werd niet geteld"
                : "Nobody counted at the end of the quarter",
        warn: closedResult.state !== "done" && !beforeLedger,
      },
      {
        label: nl ? `Kasboekjaar ${formatWorkingYear(year)}` : `Ledger year ${formatWorkingYear(year)}`,
        value: euro(ledgerYearResultCents(sorted, year, today)),
        sub: nl ? "Juli tot juni, tot de laatste telling" : "July to June, up to the last count",
      },
    );
  } else {
    facts.push({
      label: nl ? "Volgende telling" : "Next count",
      value: `${nl ? "Tegen" : "By"} ${quarterEndLabel(currentQuarter, nl)}`,
      sub: nl ? "Het einde van het kwartaal" : "The end of the quarter",
    });
  }

  const factList = (
    <dl className="mt-4 grid gap-4 sm:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.label} className="border-t border-vtk-blue/10 pt-3">
          <dt className="text-xs text-vtk-muted">{fact.label}</dt>
          <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${fact.warn ? "text-vtk-muted" : "text-vtk-ink"}`}>
            {fact.value}
          </dd>
          <dd className="mt-0.5 text-xs text-vtk-muted">{fact.sub}</dd>
        </div>
      ))}
    </dl>
  );

  const KIND_LABEL: Record<PermanentEntryKind, string> = {
    HANDED_OUT: nl ? "Meegegeven door Beheer" : "Handed out by Administration",
    RETURNED: nl ? "Teruggegeven aan Beheer" : "Returned to Administration",
    COUNT: nl ? "Telling" : "Count",
  };
  const vouchersText = (shift: number, elixir: number) =>
    [
      shift ? `${shift} ${nl ? (shift === 1 ? "shiftersbon" : "shiftersbonnen") : shift === 1 ? "shift voucher" : "shift vouchers"}` : "",
      elixir ? `${elixir} ${nl ? (elixir === 1 ? "elixirbon" : "elixirbonnen") : elixir === 1 ? "elixir voucher" : "elixir vouchers"}` : "",
    ].filter(Boolean);

  const columns = manage ? 6 : 5;
  const groups = quarters.map((quarter) => {
    const result = quarterResult(sorted, quarter, today);
    const start = quarterStart(quarter).getTime();
    const end = quarterEnd(quarter).getTime();
    const rows = sorted
      .filter((entry) => entry.date.getTime() >= start && entry.date.getTime() <= end)
      .reverse();
    let status: { text: string; tone: "strong" | "warn" | "muted" };
    if (result.state === "done") {
      // Zonder openingstelling terwijl er al regels voor dit kwartaal stonden:
      // dan werd er het kwartaal ervoor niet geteld, en loopt deze winst langer.
      const sinceStart = !result.opening && sorted.some((entry) => entry.date.getTime() < start);
      // Loopt het kwartaal nog, dan is dit een tussenstand tot de laatste telling.
      const running = end >= today.getTime();
      status = manage
        ? {
            text: `${nl ? "Winst" : "Profit"}${running ? ` ${nl ? "tot" : "up to"} ${dayMonth(result.closing.date)}` : ""} ${euro(result.resultCents)}${sinceStart ? (nl ? ", sinds de start" : ", since the start") : ""}`,
            tone: "strong",
          }
        : { text: `${nl ? "Geteld op" : "Counted on"} ${dayMonth(result.closing.date)}`, tone: "muted" };
    } else if (result.state === "missing") {
      status = {
        text: nl ? "Geen telling op het einde van het kwartaal" : "No count at the end of the quarter",
        tone: "warn",
      };
    } else {
      status = {
        text: nl
          ? `Loopt nog; tel tegen ${quarterEndLabel(quarter, nl)}`
          : `Still running; count by ${quarterEndLabel(quarter, nl)}`,
        tone: "muted",
      };
    }
    return { quarter, rows, status };
  });

  return (
    <div className="space-y-5">
      {heading}
      {nav}

      {posts.length > 1 && (
        <nav className="flex flex-wrap items-center gap-2" aria-label="Post">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">Post</span>
          {posts.map((candidate) => (
            <Link
              key={candidate.id}
              href={hrefWith({ post: postSlug(candidate.code) })}
              aria-current={candidate.id === post.id ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-[13px] ${
                candidate.id === post.id
                  ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
                  : "border-vtk-blue/15 bg-white text-vtk-body hover:bg-vtk-blue-soft/60"
              }`}
            >
              {pick(candidate.nameNl, candidate.nameEn, locale)}
            </Link>
          ))}
        </nav>
      )}

      {manage ? (
        <ManagerActions
          key={post.id}
          locale={locale}
          action={savePermanentEntryAction}
          groupId={post.id}
          postName={postName}
          today={todayValue}
          shiftVoucherValueCents={config.shiftVoucherValueCents}
          elixirVoucherValueCents={config.elixirVoucherValueCents}
          errorMessages={errorMessages}
        >
          {factList}
        </ManagerActions>
      ) : (
        <>
          <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
            <h2 className="text-lg font-semibold text-vtk-ink">{postName}</h2>
            {factList}
          </section>
          <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5 shadow-[inset_3px_0_0_var(--yellow)]">
            <h2 className="text-base font-semibold text-vtk-ink">{nl ? "Kassa tellen" : "Count the register"}</h2>
            <p className="mb-4 mt-1 text-sm text-vtk-body">
              {nl
                ? `Tel alles wat er in de kassa zit: munten, briefjes en bonnen. Haal er niets uit voor je telt; geef je geld af aan Beheer, dan geeft Beheer dat zelf in. Een telling pas je hier nog ${POST_COUNT_WINDOW_DAYS} dagen aan.`
                : `Count everything in the register: coins, notes and vouchers. Do not take anything out before counting; if you hand money to Administration, Administration enters that. You can change a count here for ${POST_COUNT_WINDOW_DAYS} days.`}
            </p>
            <EntryForm
              key={post.id}
              locale={locale}
              action={savePermanentEntryAction}
              postName={postName}
              minDate={toDateInputValue(new Date(today.getTime() - POST_COUNT_WINDOW_DAYS * 86_400_000))}
              maxDate={todayValue}
              shiftVoucherValueCents={config.shiftVoucherValueCents}
              elixirVoucherValueCents={config.elixirVoucherValueCents}
              errorMessages={errorMessages}
              values={{
                groupId: post.id,
                kind: "COUNT",
                date: todayValue,
                cash: "",
                counts: null,
                shiftVouchers: "",
                elixirVouchers: "",
                closesRegister: false,
                note: "",
              }}
            />
          </section>
        </>
      )}

      {years.length > 1 && (
        <nav className="flex flex-wrap items-center gap-2" aria-label={nl ? "Kasboekjaar" : "Ledger year"}>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">
            {nl ? "Jaar" : "Year"}
          </span>
          {years.map((tab) => (
            <Link
              key={tab}
              href={hrefWith({ jaar: tab === currentYear ? "" : String(tab) })}
              aria-current={year === tab ? "page" : undefined}
              className={`rounded-full border px-2.5 py-1 text-xs tabular-nums ${
                year === tab
                  ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
                  : "border-vtk-blue/15 text-vtk-body hover:bg-vtk-blue-soft/60"
              }`}
            >
              {formatWorkingYear(tab)}
            </Link>
          ))}
        </nav>
      )}

      <section
        aria-label={nl ? `Kasboek van ${postName}` : `${postName} ledger`}
        className="overflow-hidden rounded-2xl border border-vtk-blue/12 bg-white"
      >
        {sorted.length === 0 ? (
          <p className="p-6 text-sm text-vtk-muted">
            {manage
              ? nl
                ? `Het kasboek van ${postName} is nog leeg. Begin met de startkassa: Meegeven, met het bedrag dat Beheer meegaf.`
                : `The ${postName} ledger is still empty. Start with the starting float: Hand out, with the amount Administration gave.`
              : nl
                ? "Er staat nog niets in het kasboek. Zodra Beheer de startkassa ingeeft of jullie tellen, staat het hier."
                : "Nothing in the ledger yet. Once Administration enters the starting float or you count, it shows here."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="vtk-kassa-table w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/10 text-left text-xs font-semibold text-vtk-muted">
                  <th scope="col" className="w-[100px] px-4 py-3">{nl ? "Datum" : "Date"}</th>
                  <th scope="col" className="px-4 py-3">{nl ? "Wat" : "What"}</th>
                  <th scope="col" className="w-[112px] px-4 py-3 text-right!">{nl ? "Meegegeven" : "Handed out"}</th>
                  <th scope="col" className="w-[112px] px-4 py-3 text-right!">{nl ? "Teruggegeven" : "Returned"}</th>
                  <th scope="col" className="w-[112px] px-4 py-3 text-right!">{nl ? "Telling" : "Count"}</th>
                  {manage && <th scope="col" className="w-[124px] px-4 py-3 text-right!">{nl ? "Winst" : "Profit"}</th>}
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={`${group.quarter.year}-${group.quarter.quarter}`} className="divide-y divide-vtk-blue/5">
                  <tr className="vtk-table-group">
                    <th scope="rowgroup" colSpan={columns} data-wide>
                      <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="font-semibold text-vtk-ink">{quarterLabel(group.quarter, nl)}</span>
                        <span
                          className={
                            group.status.tone === "strong"
                              ? "font-semibold tabular-nums text-vtk-ink"
                              : group.status.tone === "warn"
                                ? "rounded-full bg-vtk-warn-soft px-2.5 py-0.5 text-xs font-semibold text-vtk-warn"
                                : "text-xs font-normal text-vtk-muted"
                          }
                        >
                          {group.status.text}
                        </span>
                      </span>
                    </th>
                  </tr>
                  {group.rows.length === 0 && (
                    <tr>
                      <td colSpan={columns} data-wide className="px-4 py-3 text-xs text-vtk-muted">
                        {nl ? "Nog niets in dit kwartaal." : "Nothing in this quarter yet."}
                      </td>
                    </tr>
                  )}
                  {group.rows.map((entry) => {
                    const value = euro(entryValueCents(entry));
                    const period = perCheckpoint.get(entry.id);
                    const editable = canEditPermanentEntry(access, entry, today);
                    const href = `${base}/admin/kassas/vast/${entry.id}`;
                    const what =
                      entry.kind === "COUNT"
                        ? `${KIND_LABEL.COUNT}${entry.createdBy ? ` ${nl ? "door" : "by"} ${entry.createdBy.name}` : ""}`
                        : `${KIND_LABEL[entry.kind]}${entry.closesRegister ? (nl ? ", volledige kassa" : ", whole register") : ""}`;
                    const details = [
                      ...(entry.kind === "COUNT"
                        ? [`${euro(entry.cashCents)} cash`, ...vouchersText(entry.shiftVouchers, entry.elixirVouchers)]
                        : vouchersText(entry.shiftVouchers, entry.elixirVouchers).map((text) => (nl ? `met ${text}` : `with ${text}`))),
                      ...(entry.note ? [entry.note] : []),
                    ].join(", ");
                    const cells = (
                      <>
                        <td data-label={nl ? "Datum" : "Date"} className="whitespace-nowrap px-4 py-3 tabular-nums text-vtk-body">
                          {formatSpentOn(entry.date, locale)}
                        </td>
                        <td data-wide className="px-4 py-3">
                          {editable ? (
                            <Link href={href} className={`text-vtk-ink hover:underline ${entry.kind === "COUNT" ? "font-semibold" : "font-medium"}`}>
                              {what}
                            </Link>
                          ) : (
                            <span className={`text-vtk-ink ${entry.kind === "COUNT" ? "font-semibold" : "font-medium"}`}>{what}</span>
                          )}
                          {details && <span className="block text-xs text-vtk-muted">{details}</span>}
                        </td>
                        <td data-label={nl ? "Meegegeven" : "Handed out"} data-empty={entry.kind !== "HANDED_OUT" || undefined} className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-vtk-body">
                          {entry.kind === "HANDED_OUT" ? value : ""}
                        </td>
                        <td data-label={nl ? "Teruggegeven" : "Returned"} data-empty={entry.kind !== "RETURNED" || undefined} className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-vtk-body">
                          {entry.kind === "RETURNED" ? value : ""}
                        </td>
                        <td data-label={nl ? "Telling" : "Count"} data-empty={entry.kind !== "COUNT" || undefined} className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-vtk-ink">
                          {entry.kind === "COUNT" ? value : ""}
                        </td>
                        {manage && (
                          <td data-label={nl ? "Winst" : "Profit"} data-empty={!period || undefined} className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                            {period && (
                              <>
                                <span className="font-semibold text-vtk-ink">{euro(period.resultCents)}</span>
                                <span className="block text-xs text-vtk-muted">
                                  {period.opening
                                    ? `${nl ? "sinds" : "since"} ${dayMonth(period.opening.date)}`
                                    : nl
                                      ? "sinds de start"
                                      : "since the start"}
                                </span>
                              </>
                            )}
                          </td>
                        )}
                      </>
                    );
                    return editable ? (
                      <LinkedRow key={entry.id} href={href} className="cursor-pointer transition-colors hover:bg-vtk-blue-soft/30">
                        {cells}
                      </LinkedRow>
                    ) : (
                      <tr key={entry.id}>{cells}</tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
