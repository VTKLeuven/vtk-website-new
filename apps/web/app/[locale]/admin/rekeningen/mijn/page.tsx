import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import type { Locale } from "@vtk/i18n";
import {
  canView,
  expenseAccess,
  expenseSenderLabel,
  getExpenseConfig,
} from "@/lib/rekeningen/server";
import { formatEuro } from "@/lib/rekeningen/expenses";
import { RekeningenNav } from "../RekeningenNav";
import { ExpenseWorkbench } from "../ExpenseWorkbench";
import { expenseInclude, toDetail, toRow } from "../rows";
import { statusWhere, type ExpenseSearchParams } from "../filters";

const PAGE_SIZE = 25;

/**
 * Wat jij zelf indiende, en hoe ver het staat.
 *
 * Bewust hetzelfde scherm als het beheeroverzicht, enkel zonder de filterbalk:
 * wie zijn eigen rekeningen zoekt heeft er hooguit tien, en die staan er al.
 */
export default async function MijnRekeningen({
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

  const access = await expenseAccess(`${base}/inloggen?next=${base}/admin/rekeningen/mijn`);
  if (!access.canSubmit && !access.canSeeOverview) {
    return (
      <p className="text-sm text-zinc-500">
        {nl
          ? "Je hebt geen toegang tot de rekeningen. Vraag IT om het recht 'Rekeningen indienen' aan je rol te hangen."
          : "You do not have access to the expenses. Ask IT to add the 'Submit expenses' permission to your role."}
      </p>
    );
  }

  const sp = await searchParams;
  const selectedId = (Array.isArray(sp.sel) ? sp.sel[0] : sp.sel)?.trim() ?? "";
  const page = Math.max(1, Number(Array.isArray(sp.p) ? sp.p[0] : sp.p) || 1);

  const where = { submittedById: access.session.user.id };

  const [count, sum, rowsRaw, openCents, config] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { amountCents: true } }),
    prisma.expense.findMany({
      where,
      orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.expense.aggregate({
      where: { AND: [where, statusWhere("TO_REIMBURSE")] },
      _sum: { amountCents: true },
      _count: true,
    }),
    getExpenseConfig(),
  ]);

  const selectedRaw = selectedId
    ? await prisma.expense.findUnique({ where: { id: selectedId }, include: expenseInclude })
    : null;
  const selected = selectedRaw && canView(access, selectedRaw) ? selectedRaw : null;

  const hrefWith = (patch: Record<string, string>) => {
    const query = new URLSearchParams();
    if (page > 1) query.set("p", String(page));
    if (selectedId) query.set("sel", selectedId);
    for (const [key, value] of Object.entries(patch)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    const qs = query.toString();
    return `${base}/admin/rekeningen/mijn${qs ? `?${qs}` : ""}`;
  };

  const openCount = openCents._count;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{nl ? "Mijn rekeningen" : "My expenses"}</h1>
          <p className="mt-1 max-w-[70ch] text-sm text-[#5c667f]">
            {openCount > 0
              ? nl
                ? `Er staat nog ${formatEuro(openCents._sum.amountCents ?? 0, locale)} open op je naam, verdeeld over ${openCount} ${openCount === 1 ? "rekening" : "rekeningen"}. Groep 5 betaalt terug.`
                : `${formatEuro(openCents._sum.amountCents ?? 0, locale)} is still outstanding in your name, across ${openCount} ${openCount === 1 ? "expense" : "expenses"}. Group 5 handles reimbursements.`
              : nl
                ? "Alles wat je indiende, met de stand van zaken erbij."
                : "Everything you submitted, with its current state."}
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
        active="mijn"
        caps={{
          submit: access.canSubmit,
          overview: access.canSeeOverview,
          settings: access.canManageAll,
        }}
      />

      <ExpenseWorkbench
        locale={locale}
        rows={rowsRaw.map((expense) => toRow(expense, locale))}
        total={count}
        totalCents={sum._sum.amountCents ?? 0}
        selected={selected ? toDetail(selected, locale, access) : null}
        hrefForRow={(id) => hrefWith({ sel: id })}
        pagination={{
          page,
          pages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
          hrefFor: (target) => hrefWith({ p: target > 1 ? String(target) : "", sel: "" }),
        }}
        emptyMessage={
          nl
            ? "Je diende nog geen rekening in. Kocht je iets voor VTK? Dien het in met een foto van het bonnetje."
            : "You have not submitted an expense yet. Bought something for VTK? Submit it with a photo of the receipt."
        }
        canManageState={access.canManageAll}
        accountantEmail={config.accountantEmail}
        senderEmail={expenseSenderLabel(config)}
        editHrefFor={(id) => `${base}/admin/rekeningen/bewerken/${id}`}
      />
    </div>
  );
}
