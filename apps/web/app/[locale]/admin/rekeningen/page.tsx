import Link from "@/components/ui/Link";
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
  EXPENSE_VIEWS_SINCE,
  expenseStatusLabel,
  formatBytes,
  formatEuro,
  parsePostOptionValue,
  postOptions,
  REIMBURSEMENT_STATES,
  reimbursementLabel,
} from "@/lib/rekeningen/expenses";
import { RekeningenNav } from "./RekeningenNav";
import { ExpenseWorkbench } from "./ExpenseWorkbench";
import { expenseInclude, toDetail, toRow } from "./rows";
import {
  activeFilterChips,
  expenseOrderBy,
  filterWhere,
  readFilters,
  reimbursementWhere,
  REIMBURSEMENT_SLUGS,
  SPENT_SORT_SLUG,
  statusWhere,
  STATUS_SLUGS,
  type ExpenseFilters,
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
  // Volledig beheer ziet de hele workflow; een postbeheerder enkel of er
  // terugbetaald is (zie `reimbursementState`).
  const full = access.canManageAll;
  const filters = readFilters(sp, currentWorkingYear(), full);
  const visibility = visibilityWhere(access);
  const userId = access.session.user.id;

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

  // De tabs: de vier workflowstappen, of de drie terugbetaalstanden.
  const tabWheres = full
    ? EXPENSE_STATUSES.map((status) => statusWhere(status))
    : REIMBURSEMENT_STATES.map((state) => reimbursementWhere(state));
  const listWhere = scoped(selectedTabWhere(filters));

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
      select: { id: true, code: true, nameNl: true, nameEn: true, active: true },
    }),
    prisma.expense.findMany({
      where: visibility,
      distinct: ["workingYear"],
      select: { workingYear: true },
      orderBy: { workingYear: "desc" },
    }),
    getExpenseConfig(),
    Promise.all(tabWheres.map((where) => prisma.expense.count({ where: scoped(where) }))),
    prisma.expense.count({ where: listWhere }),
    prisma.expense.aggregate({ where: listWhere, _sum: { amountCents: true } }),
    prisma.expense.findMany({
      where: listWhere,
      orderBy: expenseOrderBy(filters.sort),
      take: PAGE_SIZE,
      skip: (filters.page - 1) * PAGE_SIZE,
      include: expenseInclude,
    }),
    prisma.expense.aggregate({
      where: {
        AND: [yearScope, full ? statusWhere("TO_REIMBURSE") : reimbursementWhere("OPEN")],
      },
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

  // Opengeklikt = gezien. Rekeningen die je zelf indiende of die er al waren
  // voor dit bijgehouden werd, gelden altijd als gezien.
  const [, views] = await Promise.all([
    selected
      ? prisma.expenseView.createMany({
          data: [{ userId, expenseId: selected.id }],
          skipDuplicates: true,
        })
      : null,
    prisma.expenseView.findMany({
      where: { userId, expenseId: { in: rowsRaw.map((expense) => expense.id) } },
      select: { expenseId: true },
    }),
  ]);
  const seen = new Set(views.map((view) => view.expenseId));
  if (selected) seen.add(selected.id);
  const isUnseen = (expense: (typeof rowsRaw)[number]) =>
    !seen.has(expense.id) &&
    expense.submittedById !== userId &&
    expense.createdAt >= EXPENSE_VIEWS_SINCE;

  const postFilterOptions = posts.flatMap((post) =>
    postOptions(post, nl ? post.nameNl : post.nameEn, true),
  );
  const postLabel = (value: string) => {
    const option = postFilterOptions.find((candidate) => candidate.value === value);
    if (option) return option.name;
    const { groupId, sub } = parsePostOptionValue(value);
    const post = posts.find((candidate) => candidate.id === groupId);
    const name = post ? (nl ? post.nameNl : post.nameEn) : groupId;
    return sub ? `${name} · ${sub}` : name;
  };

  // Eén plek waar links gebouwd worden, zodat elke knop dezelfde filters
  // meedraagt en enkel verandert wat hij zelf bedoelt.
  const hrefWith = (patch: Record<string, string>) => {
    const query = new URLSearchParams();
    const set = (key: string, value: string) => {
      if (value) query.set(key, value);
    };
    set("jaar", filters.year === "all" ? "alles" : String(filters.year));
    set("status", statusSlug(filters));
    set("sorteer", filters.sort === "spent" ? SPENT_SORT_SLUG : "");
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
          <p className="mt-1 max-w-5xl text-sm text-[#5c667f]">
            {access.canManageAll
              ? nl
                ? "Alles wat er voor VTK betaald werd, met het bonnetje erbij. Vink af wat terugbetaald is en stuur het blad door naar de boekhouding."
                : "Everything paid for VTK, receipt included. Tick off what has been reimbursed and forward the sheet to the accountant."
              : nl
                ? "De rekeningen van je eigen post. Terugbetalen en inboeken gebeurt door Beheer."
                : "Your own post's expenses. Reimbursing and booking is done by Administration."}
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
        {full && (
          <>
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
          </>
        )}
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
        {(full
          ? EXPENSE_STATUSES.map((status) => ({
              slug: STATUS_SLUGS[status],
              label: expenseStatusLabel(status, nl),
              active: filters.status === status,
            }))
          : REIMBURSEMENT_STATES.map((state) => ({
              slug: REIMBURSEMENT_SLUGS[state],
              label: reimbursementLabel(state, nl),
              active: filters.reimbursement === state,
            }))
        ).map((tab, index) => (
          <Link
            key={tab.slug}
            href={hrefWith({ status: tab.slug, p: "", sel: "" })}
            aria-current={tab.active ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
              tab.active
                ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
                : "border-vtk-blue/15 bg-white text-[#34405e] hover:bg-vtk-blue-soft/60"
            }`}
          >
            {tab.label}
            <span className="tabular-nums font-semibold">{counts[index]}</span>
          </Link>
        ))}
        <Link
          href={hrefWith({ status: "", p: "", sel: "" })}
          aria-current={statusSlug(filters) === "" ? "page" : undefined}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
            statusSlug(filters) === ""
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
        {statusSlug(filters) && <input type="hidden" name="status" value={statusSlug(filters)} />}
        {filters.sort === "spent" && <input type="hidden" name="sorteer" value={SPENT_SORT_SLUG} />}

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
              {postFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.name}
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

      {/* Standaard op indiendatum: een rekening van een maand geleden die vandaag
          binnenkwam, staat dan bovenaan in plaats van onder de vouw. */}
      <nav className="flex flex-wrap items-center gap-2" aria-label={nl ? "Sorteren" : "Sort"}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5c667f]">
          {nl ? "Sorteren op" : "Sort by"}
        </span>
        {(
          [
            { sort: "submitted", slug: "", label: nl ? "Indiendatum" : "Date submitted" },
            { sort: "spent", slug: SPENT_SORT_SLUG, label: nl ? "Datum uitgave" : "Date of expense" },
          ] as const
        ).map((option) => (
          <Link
            key={option.sort}
            href={hrefWith({ sorteer: option.slug, p: "", sel: "" })}
            aria-current={filters.sort === option.sort ? "page" : undefined}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              filters.sort === option.sort
                ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
                : "border-vtk-blue/15 text-[#34405e] hover:bg-vtk-blue-soft/60"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <ExpenseWorkbench
        locale={locale}
        sort={filters.sort}
        rows={rowsRaw.map((expense) => ({
          ...toRow(expense, locale, access),
          unseen: isUnseen(expense),
          detailHref: hrefWith({ sel: expense.id }),
          editHref: `${base}/admin/rekeningen/bewerken/${expense.id}`,
        }))}
        total={listCount}
        totalCents={listSum._sum.amountCents ?? 0}
        selected={
          selected
            ? {
                ...toDetail(selected, locale, access),
                editHref: `${base}/admin/rekeningen/bewerken/${selected.id}`,
              }
            : null
        }
        hrefWithoutSel={hrefWith({ sel: "" })}
        pagination={{
          page: filters.page,
          pages,
          previousHref:
            filters.page > 1
              ? hrefWith({ p: filters.page > 2 ? String(filters.page - 1) : "", sel: "" })
              : null,
          nextHref:
            filters.page < pages
              ? hrefWith({ p: String(filters.page + 1), sel: "" })
              : null,
        }}
        emptyMessage={
          nl
            ? "Geen rekeningen die aan deze filters voldoen."
            : "No expenses match these filters."
        }
        canManageState={access.canManageAll}
        accountantEmail={config.accountantEmail}
        senderEmail={expenseSenderLabel(config)}
      />
    </div>
  );
}

/** De `where` van de gekozen tab, in de weergave die bij de gebruiker hoort. */
function selectedTabWhere(filters: ExpenseFilters) {
  if (filters.status !== "all") return statusWhere(filters.status);
  if (filters.reimbursement !== "all") return reimbursementWhere(filters.reimbursement);
  return {};
}

/** `?status=` voor de gekozen tab; leeg bij "Alles". */
function statusSlug(filters: ExpenseFilters): string {
  if (filters.status !== "all") return STATUS_SLUGS[filters.status];
  if (filters.reimbursement !== "all") return REIMBURSEMENT_SLUGS[filters.reimbursement];
  return "";
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
