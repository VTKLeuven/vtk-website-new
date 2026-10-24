import Link from "@/components/ui/Link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";
import { pick, type Locale } from "@vtk/i18n";
import { Input, Label, Select } from "@vtk/ui";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { hasLocale } from "@/lib/locale";
import { currentWorkingYear, formatWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { formatEuro } from "@/lib/rekeningen/expenses";
import { cashRegisterAccess, permanentTabLabel } from "@/lib/kassas/server";
import {
  CASH_REGISTER_STATUSES,
  PERMANENT_POST_CODES,
  PERMANENT_POST_FILTER,
  statusFromSlug,
  statusLabel,
  STATUS_SLUGS,
  type CashRegisterStatus,
} from "@/lib/kassas/kassa";
import { setCashRegisterStatusAction } from "@/app/actions/kassas";
import { KassaNav } from "./KassaNav";
import { StatusSelect } from "./StatusSelect";
import { kassaErrorMessages } from "./messages";
import { listInclude, toListRows } from "./rows";

type SearchParams = { jaar?: string; status?: string; post?: string; q?: string };

/** Meer dan dit per jaar is geen kassa-overzicht meer; dan zoek je. */
const LIST_LIMIT = 500;

export default async function KassaOverzicht({
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

  const access = await cashRegisterAccess(`${base}/inloggen?next=${base}/admin/kassas`);
  if (!access.canRequest) {
    return (
      <p className="text-sm text-vtk-muted">
        {nl
          ? "Je hebt geen toegang tot de kassa's. Vraag IT om het recht 'Een kassa aanvragen' aan je rol te hangen."
          : "You do not have access to the cash registers. Ask IT to add the 'Request a cash register' permission to your role."}
      </p>
    );
  }
  // Wie enkel mag aanvragen, heeft aan het beheeroverzicht niets en start bij
  // zijn eigen aanvragen.
  if (!access.canManage) redirect(`${base}/admin/kassas/mijn`);

  const sp = await searchParams;
  const year = sp.jaar === "alles" ? "all" : Number(sp.jaar) || currentWorkingYear();
  const status = statusFromSlug(sp.status);
  const post = sp.post ?? "";
  const q = (sp.q ?? "").trim().slice(0, 100);

  const postWhere: Prisma.CashRegisterWhereInput =
    post === PERMANENT_POST_FILTER
      ? { group: { code: { in: [...PERMANENT_POST_CODES] } } }
      : post
        ? { groupId: post }
        : {};
  const scope: Prisma.CashRegisterWhereInput = {
    AND: [
      year === "all" ? {} : { workingYear: year },
      postWhere,
      q
        ? {
            OR: [
              { activity: { contains: q, mode: "insensitive" } },
              { responsibleName: { contains: q, mode: "insensitive" } },
              { postLabel: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const [groups, years, statusCounts, registers] = await Promise.all([
    prisma.group.findMany({
      where: { OR: [{ active: true }, { cashRegisters: { some: {} } }] },
      orderBy: [{ type: "asc" }, { orderInPraesidium: "asc" }, { nameNl: "asc" }],
      select: { id: true, code: true, nameNl: true, nameEn: true },
    }),
    prisma.cashRegister.findMany({
      distinct: ["workingYear"],
      select: { workingYear: true },
      orderBy: { workingYear: "desc" },
    }),
    prisma.cashRegister.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    prisma.cashRegister.findMany({
      where: { AND: [scope, status ? { status } : {}] },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: listInclude,
      take: LIST_LIMIT,
    }),
  ]);

  const rows = await toListRows(registers, locale);
  const countOf = (value: CashRegisterStatus) =>
    statusCounts.find((row) => row.status === value)?._count._all ?? 0;
  const allCount = statusCounts.reduce((sum, row) => sum + row._count._all, 0);
  const totalCents = rows.reduce((sum, row) => sum + row.result.totalCents, 0);
  const permanentNames = groups
    .filter((group) => (PERMANENT_POST_CODES as readonly string[]).includes(group.code))
    .map((group) => pick(group.nameNl, group.nameEn, locale));
  // "Cursusdienst, Fakbar en Theokot samen": de namen zoals ze nu heten.
  const permanentLabel =
    permanentNames.length > 1
      ? `${permanentNames.slice(0, -1).join(", ")} ${nl ? "en" : "and"} ${permanentNames.at(-1)} ${nl ? "samen" : "together"}`
      : (permanentNames[0] ?? "");
  const errorMessages = kassaErrorMessages(locale);

  const hrefWith = (patch: Partial<Record<keyof SearchParams, string>>) => {
    const query = new URLSearchParams();
    const values: Record<string, string> = {
      jaar: year === "all" ? "alles" : year === currentWorkingYear() ? "" : String(year),
      status: status ? STATUS_SLUGS[status] : "",
      post,
      q,
      ...patch,
    };
    for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
    const qs = query.toString();
    return `${base}/admin/kassas${qs ? `?${qs}` : ""}`;
  };

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] ${
      active
        ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
        : "border-vtk-blue/15 bg-white text-vtk-body hover:bg-vtk-blue-soft/60"
    }`;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{nl ? "Kassa's" : "Cash registers"}</h1>
          <p className="mt-1 max-w-5xl text-sm text-vtk-muted">
            {nl
              ? "Elke kassa die een post aanvroeg, van de aanvraag tot het kasboek. Aanvaard een aanvraag om de aanvrager te mailen, en tel de kassa na de activiteit in het detail."
              : "Every cash register a post requested, from the request to the cash book. Accept a request to email the requester, and count the register after the activity in its detail."}
          </p>
        </div>
        <Link
          href={`${base}/admin/kassas/aanvragen`}
          className="inline-flex h-10 items-center justify-center rounded-full border border-vtk-ink bg-vtk-ink px-4 text-sm font-medium text-vtk-surface hover:bg-vtk-navy"
        >
          {nl ? "Kassa aanvragen" : "Request a register"}
        </Link>
      </header>

      <KassaNav
        base={base}
        nl={nl}
        active="overzicht"
        caps={{ request: access.canRequest, manage: true }}
        permanentLabel={permanentTabLabel(access, locale)}
      />

      <nav className="flex flex-wrap items-center gap-2" aria-label={nl ? "Werkingsjaar" : "Working year"}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">
          {nl ? "Jaar" : "Year"}
        </span>
        {workingYearTabs(years.map((row) => row.workingYear)).map((tab) => (
          <Link
            key={tab}
            href={hrefWith({ jaar: tab === currentWorkingYear() ? "" : String(tab) })}
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
        <Link
          href={hrefWith({ jaar: "alles" })}
          aria-current={year === "all" ? "page" : undefined}
          className={`rounded-full border px-2.5 py-1 text-xs ${
            year === "all"
              ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
              : "border-vtk-blue/15 text-vtk-body hover:bg-vtk-blue-soft/60"
          }`}
        >
          {nl ? "Alle jaren" : "All years"}
        </Link>
      </nav>

      {/* De statuskolom van het rekenblad als tabs, met het aantal erbij: "wat
          moet er nog gemaakt worden" is één klik. */}
      <nav className="flex flex-wrap gap-2" aria-label="Status">
        {CASH_REGISTER_STATUSES.map((value) => (
          <Link
            key={value}
            href={hrefWith({ status: STATUS_SLUGS[value] })}
            aria-current={status === value ? "page" : undefined}
            className={chip(status === value)}
          >
            {statusLabel(value, nl)}
            <span className="font-semibold tabular-nums">{countOf(value)}</span>
          </Link>
        ))}
        <Link href={hrefWith({ status: "" })} aria-current={!status ? "page" : undefined} className={chip(!status)}>
          {nl ? "Alles" : "All"}
          <span className="font-semibold tabular-nums">{allCount}</span>
        </Link>
      </nav>

      {/* Een gewoon GET-formulier: de filters staan in de URL, dus een gefilterde
          lijst is een deelbare link. */}
      <form method="get" className="rounded-2xl border border-vtk-blue/12 bg-white p-4">
        {year !== "all" && year !== currentWorkingYear() && <input type="hidden" name="jaar" value={year} />}
        {year === "all" && <input type="hidden" name="jaar" value="alles" />}
        {status && <input type="hidden" name="status" value={STATUS_SLUGS[status]} />}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="q">{nl ? "Zoeken" : "Search"}</Label>
            <Input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder={nl ? "Activiteit, verantwoordelijke of post" : "Activity, person responsible or post"}
            />
          </div>
          <div className="w-60">
            <Label htmlFor="post">{nl ? "Post" : "Post"}</Label>
            <Select id="post" name="post" defaultValue={post}>
              <option value="">{nl ? "Alle posten" : "All posts"}</option>
              {permanentNames.length > 0 && (
                <option value={PERMANENT_POST_FILTER}>{permanentLabel}</option>
              )}
              <optgroup label={nl ? "Eén post" : "One post"}>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {pick(group.nameNl, group.nameEn, locale)}
                  </option>
                ))}
              </optgroup>
            </Select>
          </div>
          <button
            type="submit"
            className="ml-auto inline-flex h-10 items-center justify-center rounded-full border border-vtk-ink bg-vtk-ink px-4 text-sm font-medium text-vtk-surface hover:bg-vtk-navy"
          >
            {nl ? "Filteren" : "Filter"}
          </button>
        </div>
        {(q || post) && (
          <div className="mt-3 border-t border-vtk-blue/10 pt-3">
            <Link
              href={hrefWith({ q: "", post: "" })}
              className="text-xs font-medium text-vtk-muted underline underline-offset-4"
            >
              {nl ? "Zoekterm en post wissen" : "Clear search and post"}
            </Link>
          </div>
        )}
      </form>

      <section className="overflow-hidden rounded-2xl border border-vtk-blue/12 bg-white">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-vtk-muted">
            {nl ? "Geen kassa's die aan deze filters voldoen." : "No cash registers match these filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="vtk-kassa-table w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/10 text-left text-xs font-semibold text-vtk-muted">
                  <th scope="col" className="w-[100px] px-4 py-3">{nl ? "Datum" : "Date"}</th>
                  <th scope="col" className="px-4 py-3">{nl ? "Activiteit" : "Activity"}</th>
                  <th scope="col" className="w-[130px] px-4 py-3">{nl ? "Post" : "Post"}</th>
                  <th scope="col" className="w-[170px] px-4 py-3">Status</th>
                  <th scope="col" className="w-[96px] px-4 py-3 text-right">{nl ? "Begin" : "Start"}</th>
                  <th scope="col" className="w-[116px] px-4 py-3 text-right">{nl ? "Resultaat" : "Result"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vtk-blue/5">
                {rows.map((row) => {
                  const href = `${base}/admin/kassas/${row.id}`;
                  return (
                    <LinkedRow
                      key={row.id}
                      href={href}
                      className={`cursor-pointer transition-colors hover:bg-vtk-blue-soft/30 ${
                        row.status === "REQUESTED" ? "bg-vtk-yellow/10" : ""
                      }`}
                    >
                      <td data-label={nl ? "Datum" : "Date"} className="whitespace-nowrap px-4 py-3 tabular-nums text-vtk-body">
                        {row.dateLabel}
                        {row.timeLabel && <span className="block text-xs text-vtk-muted">{row.timeLabel}</span>}
                      </td>
                      <td data-wide className="px-4 py-3">
                        <Link href={href} className="font-medium text-vtk-ink hover:underline">
                          {row.activity}
                        </Link>
                        <span className="block text-xs text-vtk-muted">{row.responsibleName}</span>
                        {row.devices.length > 0 && (
                          <span className="block text-xs text-vtk-muted">{row.devices.join(", ")}</span>
                        )}
                      </td>
                      <td data-label={nl ? "Post" : "Post"} className="px-4 py-3 text-vtk-body">
                        {row.postLabel}
                      </td>
                      <td data-label="Status" className="px-4 py-3">
                        {row.status === "REQUESTED" ? (
                          <Link
                            href={href}
                            className="inline-flex h-8 items-center rounded-full bg-vtk-yellow px-3 text-sm font-semibold text-vtk-on-yellow hover:bg-vtk-yellow-dark"
                          >
                            {nl ? "Aanvaarden" : "Accept"}
                          </Link>
                        ) : (
                          <StatusSelect
                            id={row.id}
                            status={row.status}
                            action={setCashRegisterStatusAction}
                            locale={locale}
                            label={`Status: ${row.activity}`}
                            errorMessages={errorMessages}
                          />
                        )}
                      </td>
                      <td
                        data-label={nl ? "Begin" : "Start"}
                        className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-vtk-body"
                      >
                        {formatEuro(row.result.startCents, locale)}
                      </td>
                      <td data-label={nl ? "Resultaat" : "Result"} className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {row.counted || row.result.totalCents !== 0 ? (
                          <span className="font-semibold text-vtk-ink">{formatEuro(row.result.totalCents, locale)}</span>
                        ) : (
                          <span className="text-xs text-vtk-muted">{nl ? "niet geteld" : "not counted"}</span>
                        )}
                      </td>
                    </LinkedRow>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-vtk-blue/10 text-sm">
                  <td colSpan={5} className="px-4 py-3 text-vtk-muted">
                    {nl
                      ? `${rows.length} ${rows.length === 1 ? "kassa" : "kassa's"}, finaal resultaat samen`
                      : `${rows.length} ${rows.length === 1 ? "register" : "registers"}, final result combined`}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-vtk-ink">
                    {formatEuro(totalCents, locale)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
