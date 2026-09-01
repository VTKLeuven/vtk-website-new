import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import type { Locale } from "@vtk/i18n";
import { Input, Label, Select } from "@vtk/ui";
import { currentWorkingYear, formatWorkingYear, workingYearTabs } from "@/lib/workingYear";
import {
  canView,
  expenseAccess,
  getExpenseConfig,
  visibilityWhere,
  expenseSenderLabel,
} from "@/lib/rekeningen/server";
import {
  EXPENSE_STATUSES,
  expenseStatusLabel,
  formatBytes,
  formatEuro,
} from "@/lib/rekeningen/expenses";
import { RekeningenNav } from "./RekeningenNav";
import { ExpenseWorkbench } from "./ExpenseWorkbench";
import { expenseInclude, toDetail, toRow } from "./rows";
import {
  activeFilterChips,
  filterWhere,
  readFilters,
  statusWhere,
  STATUS_SLUGS,
  type ExpenseSearchParams,
} from "./filters";

const PAGE_SIZE = 25;

export default async function RekeningenOverzicht({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ExpenseSearchParams>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const access = await expenseAccess(`${base}/inloggen?next=${base}/admin/rekeningen`);
  if (!access.canSubmit && !access.canSeeOverview) {
    return (
      <p className="text-sm text-zinc-500">
        {nl
          ? "Je hebt geen toegang tot de rekeningen. Vraag IT om het recht 'Rekeningen indienen' aan je rol te hangen."
          : "You do not have access to the expenses. Ask IT to add the 'Submit expenses' permission to your role."}
      </p>
    );
  }

  // Wie enkel mag indienen heeft hier niets te zoeken en start bij zijn eigen
  // rekeningen; zonder deze omleiding landt hij op een leeg beheerscherm.
  if (!access.canSeeOverview) redirect(`${base}/admin/rekeningen/mijn`);

  const sp = await searchParams;
  const filters = readFilters(sp, currentWorkingYear());
  const visibility = visibilityWhere(access);

  const scoped = (extra: object = {}) => ({
    AND: [visibility ?? {}, filterWhere(filters), extra],
  });
  // De cijfers bovenaan beschrijven de werklast, niet de filterselectie: ze
  // volgen wel het gekozen jaar en de zichtbaarheid, maar niet de zoekterm.
  const yearScope = {
    AND: [
      visibility ?? {},
      filters.year === "all" ? {} : { workingYear: filters.year },
    ],
  };

  const [
    posts,
    yearsWithData,
    config,
    counts,
    listCount,
    listSum,
    rowsRaw,
    toReimburse,
    yearTotals,
    storage,
  ] = await Promise.all([
    prisma.group.findMany({
      where: access.canManageAll ? {} : { id: { in: access.postScope } },
      orderBy: [{ type: "asc" }, { orderInPraesidium: "asc" }, { nameNl: "asc" }],
      select: { id: true, nameNl: true, nameEn: true, active: true },
    }),
    prisma.expense.findMany({
      where: visibility,
      distinct: ["workingYear"],
      select: { workingYear: true },
      orderBy: { workingYear: "desc" },
    }),
    getExpenseConfig(),
    Promise.all(
      EXPENSE_STATUSES.map((status) =>
        prisma.expense.count({ where: scoped(statusWhere(status)) }),
      ),
    ),
    prisma.expense.count({
      where: scoped(filters.status === "all" ? {} : statusWhere(filters.status)),
    }),
    prisma.expense.aggregate({
      where: scoped(filters.status === "all" ? {} : statusWhere(filters.status)),
      _sum: { amountCents: true },
    }),
    prisma.expense.findMany({
      where: scoped(filters.status === "all" ? {} : statusWhere(filters.status)),
      orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
      take: PAGE_SIZE,
      skip: (filters.page - 1) * PAGE_SIZE,
    }),
    prisma.expense.aggregate({
      where: { AND: [yearScope, statusWhere("TO_REIMBURSE")] },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.expense.aggregate({ where: yearScope, _sum: { amountCents: true }, _count: true }),
    prisma.expense.aggregate({ where: yearScope, _sum: { receiptSize: true } }),
  ]);

  // De geopende rekening wordt apart opgehaald (ze hoeft niet op de zichtbare
  // bladzijde te staan) en apart getoetst: `?sel=` komt uit de URL, dus een id
  // van buiten je bereik mag niets opleveren.
  const selectedRaw = filters.selected
    ? await prisma.expense.findUnique({
        where: { id: filters.selected },
        include: expenseInclude,
      })
    : null;
  const selected = selectedRaw && canView(access, selectedRaw) ? selectedRaw : null;

  const postLabel = (id: string) =>
    posts.find((post) => post.id === id)?.[nl ? "nameNl" : "nameEn"] ?? id;

  // Eén plek waar links gebouwd worden, zodat elke knop dezelfde filters
  // meedraagt en enkel verandert wat hij zelf bedoelt.
  const hrefWith = (patch: Record<string, string>) => {
    const query = new URLSearchParams();
    const set = (key: string, value: string) => {
      if (value) query.set(key, value);
    };
    set("jaar", filters.year === "all" ? "alles" : String(filters.year));
    set("status", filters.status === "all" ? "" : STATUS_SLUGS[filters.status]);
    set("q", filters.q);
    set("post", filters.groupId);
    set("van", filters.from);
    set("tot", filters.to);
    set("min", filters.min);
    set("max", filters.max);
    set("wie", filters.payer);
    if (filters.page > 1) set("p", String(filters.page));
    set("sel", filters.selected);
    for (const [key, value] of Object.entries(patch)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    const qs = query.toString();
    return `${base}/admin/rekeningen${qs ? `?${qs}` : ""}`;
  };

  const chips = activeFilterChips(filters, nl, postLabel);
  const years = workingYearTabs(yearsWithData.map((row) => row.workingYear));
  const pages = Math.max(1, Math.ceil(listCount / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{nl ? "Rekeningen" : "Expenses"}</h1>
          <p className="mt-1 max-w-[70ch] text-sm text-[#5c667f]">
            {access.canManageAll
              ? nl
                ? "Alles wat er voor VTK betaald werd, met het bonnetje erbij. Vink af wat terugbetaald is en stuur het blad door naar de boekhouding."
                : "Everything paid for VTK, receipt included. Tick off what has been reimbursed and forward the sheet to the accountant."
              : nl
                ? "De rekeningen van je eigen post. Terugbetalen en inboeken gebeurt door Groep 5."
                : "Your own post's expenses. Reimbursing and booking is done by Group 5."}
          </p>
        </div>
        <Link
          href={`${base}/admin/rekeningen/indienen`}
          className="inline-flex h-10 items-center justify-center rounded-full border border-vtk-ink bg-vtk-ink px-4 text-sm font-medium text-vtk-surface hover:bg-vtk-navy"
        >
          {nl ? "Rekening indienen" : "Submit an expense"}
        </Link>
      </header>

      <RekeningenNav
        base={base}
        nl={nl}
        active="overzicht"
        caps={{
          submit: access.canSubmit,
          overview: access.canSeeOverview,
          settings: access.canManageAll,
        }}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          highlight
          label={nl ? "Terug te betalen" : "To reimburse"}
          value={formatEuro(toReimburse._sum.amountCents ?? 0, locale)}
          note={
            nl
              ? `${toReimburse._count} ${toReimburse._count === 1 ? "rekening" : "rekeningen"}`
              : `${toReimburse._count} ${toReimburse._count === 1 ? "expense" : "expenses"}`
          }
        />
        <Stat
          label={nl ? "Nog door te sturen" : "Still to forward"}
          value={String(counts[1])}
          note={nl ? "naar de boekhouder" : "to the accountant"}
        />
        <Stat
          label={nl ? "Nog in te boeken" : "Still to book"}
          value={String(counts[2])}
          note={nl ? "wacht op bevestiging" : "awaiting confirmation"}
        />
        <Stat
          label={
            filters.year === "all"
              ? nl
                ? "Alle jaren"
                : "All years"
              : `${nl ? "Werkingsjaar" : "Working year"} ${formatWorkingYear(filters.year)}`
          }
          value={formatEuro(yearTotals._sum.amountCents ?? 0, locale)}
          note={
            nl
              ? `${yearTotals._count} rekeningen · ${formatBytes(storage._sum.receiptSize ?? 0, locale)} aan bonnetjes`
              : `${yearTotals._count} expenses · ${formatBytes(storage._sum.receiptSize ?? 0, locale)} of receipts`
          }
        />
      </section>

      {/* Werkingsjaren. Elk jaar wordt door de boekhouding apart afgesloten, dus
          het jaar staat boven de statusstappen en niet ertussen. */}
      <nav className="flex flex-wrap items-center gap-2" aria-label={nl ? "Werkingsjaar" : "Working year"}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5c667f]">
          {nl ? "Jaar" : "Year"}
        </span>
        {years.map((year) => (
          <Link
            key={year}
            href={hrefWith({ jaar: String(year), p: "", sel: "" })}
            aria-current={filters.year === year ? "page" : undefined}
            className={`rounded-full border px-2.5 py-1 text-xs tabular-nums ${
              filters.year === year
                ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
                : "border-vtk-blue/15 text-[#34405e] hover:bg-vtk-blue-soft/60"
            }`}
          >
            {formatWorkingYear(year)}
          </Link>
        ))}
        <Link
          href={hrefWith({ jaar: "alles", p: "", sel: "" })}
          aria-current={filters.year === "all" ? "page" : undefined}
          className={`rounded-full border px-2.5 py-1 text-xs ${
            filters.year === "all"
              ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
              : "border-vtk-blue/15 text-[#34405e] hover:bg-vtk-blue-soft/60"
          }`}
        >
          {nl ? "Alle jaren" : "All years"}
        </Link>
      </nav>

      {/* De workflow als tabs: "wat moet ik nog doen" is een knop, geen
          filtercombinatie die je zelf moet samenstellen. */}
      <nav className="flex flex-wrap gap-2" aria-label={nl ? "Status" : "Status"}>
        {EXPENSE_STATUSES.map((status, index) => (
          <Link
            key={status}
            href={hrefWith({ status: STATUS_SLUGS[status], p: "", sel: "" })}
            aria-current={filters.status === status ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
              filters.status === status
                ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
                : "border-vtk-blue/15 bg-white text-[#34405e] hover:bg-vtk-blue-soft/60"
            }`}
          >
            {expenseStatusLabel(status, nl)}
            <span className="tabular-nums font-semibold">{counts[index]}</span>
          </Link>
        ))}
        <Link
          href={hrefWith({ status: "", p: "", sel: "" })}
          aria-current={filters.status === "all" ? "page" : undefined}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
            filters.status === "all"
              ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
              : "border-vtk-blue/15 bg-white text-[#34405e] hover:bg-vtk-blue-soft/60"
          }`}
        >
          {nl ? "Alles" : "All"}
          <span className="tabular-nums font-semibold">
            {counts.reduce((total, count) => total + count, 0)}
          </span>
        </Link>
      </nav>

      {/* Een gewoon GET-formulier: de filters staan in de URL, dus de terugknop
          werkt en een gefilterde lijst is een deelbare link. */}
      <form method="get" className="space-y-3 rounded-2xl border border-vtk-blue/12 bg-white p-4">
        {filters.year !== "all" && <input type="hidden" name="jaar" value={filters.year} />}
        {filters.year === "all" && <input type="hidden" name="jaar" value="alles" />}
        {filters.status !== "all" && (
          <input type="hidden" name="status" value={STATUS_SLUGS[filters.status]} />
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="q">{nl ? "Zoeken" : "Search"}</Label>
            <Input
              id="q"
              name="q"
              type="search"
              defaultValue={filters.q}
              placeholder={
                nl
                  ? "Omschrijving, activiteit, naam, post, IBAN of bedrag"
                  : "Description, activity, name, post, IBAN or amount"
              }
            />
          </div>
          <div className="w-56">
            <Label htmlFor="post">{nl ? "Post" : "Post"}</Label>
            <Select id="post" name="post" defaultValue={filters.groupId}>
              <option value="">{nl ? "Alle posten" : "All posts"}</option>
              {posts.map((post) => (
                <option key={post.id} value={post.id}>
                  {nl ? post.nameNl : post.nameEn}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Label htmlFor="wie">{nl ? "Wie betaalde" : "Who paid"}</Label>
            <Input id="wie" name="wie" defaultValue={filters.payer} />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Label htmlFor="van">{nl ? "Van" : "From"}</Label>
            <Input id="van" name="van" type="date" defaultValue={filters.from} />
          </div>
          <div className="w-44">
            <Label htmlFor="tot">{nl ? "Tot" : "To"}</Label>
            <Input id="tot" name="tot" type="date" defaultValue={filters.to} />
          </div>
          <div className="w-32">
            <Label htmlFor="min">{nl ? "Min. bedrag" : "Min. amount"}</Label>
            <Input id="min" name="min" inputMode="decimal" defaultValue={filters.min} placeholder="0" />
          </div>
          <div className="w-32">
            <Label htmlFor="max">{nl ? "Max. bedrag" : "Max. amount"}</Label>
            <Input id="max" name="max" inputMode="decimal" defaultValue={filters.max} placeholder="1000" />
          </div>
          <button
            type="submit"
            className="ml-auto inline-flex h-10 items-center justify-center rounded-full border border-vtk-ink bg-vtk-ink px-4 text-sm font-medium text-vtk-surface hover:bg-vtk-navy"
          >
            {nl ? "Filteren" : "Filter"}
          </button>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-vtk-blue/10 pt-3">
            {chips.map((chip) => (
              <Link
                key={chip.key}
                href={hrefWith({ ...chip.clear, p: "", sel: "" })}
                className="inline-flex items-center gap-1.5 rounded-full border border-vtk-blue/15 bg-vtk-blue-soft/50 px-3 py-1 text-xs text-[#34405e] hover:border-vtk-blue/30"
              >
                {chip.label}
                <span aria-hidden>×</span>
                <span className="sr-only">{nl ? "filter wissen" : "clear filter"}</span>
              </Link>
            ))}
            <Link
              href={`${base}/admin/rekeningen`}
              className="text-xs font-medium text-[#5c667f] underline underline-offset-4"
            >
              {nl ? "Alle filters wissen" : "Clear all filters"}
            </Link>
          </div>
        )}
      </form>

      <ExpenseWorkbench
        locale={locale}
        rows={rowsRaw.map((expense) => toRow(expense, locale))}
        total={listCount}
        totalCents={listSum._sum.amountCents ?? 0}
        selected={selected ? toDetail(selected, locale, access) : null}
        hrefForRow={(id) => hrefWith({ sel: id })}
        pagination={{
          page: filters.page,
          pages,
          hrefFor: (page) => hrefWith({ p: page > 1 ? String(page) : "", sel: "" }),
        }}
        emptyMessage={
          nl
            ? "Geen rekeningen die aan deze filters voldoen."
            : "No expenses match these filters."
        }
        canManageState={access.canManageAll}
        accountantEmail={config.accountantEmail}
        senderEmail={expenseSenderLabel(config)}
        editHrefFor={(id) => `${base}/admin/rekeningen/bewerken/${id}`}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  highlight,
}: {
  label: string;
  value: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-vtk-blue/12 bg-white p-4 ${
        highlight ? "shadow-[inset_3px_0_0_var(--yellow)]" : ""
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5c667f]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-vtk-ink">{value}</div>
      <div className="mt-0.5 text-xs text-[#5c667f]">{note}</div>
    </div>
  );
}
