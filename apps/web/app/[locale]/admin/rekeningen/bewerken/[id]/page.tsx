import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import type { Locale } from "@vtk/i18n";
import { pick } from "@vtk/i18n";
import { updateExpenseAction } from "@/app/actions/expenses";
import { canEdit, canView, expenseAccess } from "@/lib/rekeningen/server";
import { formatAmount, formatEuro, toDateInputValue } from "@/lib/rekeningen/expenses";
import { ExpenseForm } from "../../ExpenseForm";
import { expenseErrorMessages } from "../../messages";

/**
 * Eén rekening bijwerken.
 *
 * Bewust een eigen pagina en geen modal in de inspector: het is hetzelfde blad
 * als bij het indienen, met dezelfde negen velden en een upload erbij. Dat past
 * niet in een paneel van 320 pixels breed.
 */
export default async function RekeningBewerken({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const access = await expenseAccess(
    `${base}/inloggen?next=${base}/admin/rekeningen/bewerken/${id}`,
  );
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense || !canView(access, expense)) notFound();

  const backHref = `${base}/admin/rekeningen${
    access.canSeeOverview ? `?sel=${expense.id}` : `/mijn?sel=${expense.id}`
  }`;

  if (!canEdit(access, expense)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{nl ? "Rekening bewerken" : "Edit expense"}</h1>
        <p className="max-w-5xl rounded-2xl border border-vtk-blue/12 bg-white p-5 text-sm text-[#34405e]">
          {(expense.paymentMethod === "PERSONAL" && expense.paidAt) || expense.sentAt || expense.bookedAt
            ? nl
              ? `"${expense.description}" (${formatEuro(expense.amountCents, locale)}) is al terugbetaald, doorgestuurd of ingeboekt en kan niet meer aangepast worden. Het bedrag op het blad moet gelijk blijven aan wat er uitbetaald en geboekt is. Vraag Beheer om het vinkje eerst weg te halen.`
              : `"${expense.description}" (${formatEuro(expense.amountCents, locale)}) has already been reimbursed, forwarded or booked and can no longer be changed. The amount on the sheet has to match what was paid out and booked. Ask Administration to clear that first.`
            : nl
              ? "Je hebt geen recht om deze rekening te bewerken."
              : "You do not have the right to edit this expense."}
        </p>
        <Link href={backHref} className="text-sm font-medium text-vtk-ink underline underline-offset-4">
          {nl ? "Terug naar de lijst" : "Back to the list"}
        </Link>
      </div>
    );
  }

  const ownGroupIds = access.session.groups.map((group) => group.id);
  const groups = await prisma.group.findMany({
    where: {
      OR: [
        { active: true },
        { id: { in: [...ownGroupIds, expense.groupId].filter((value): value is string => Boolean(value)) } },
      ],
    },
    orderBy: [{ type: "asc" }, { orderInPraesidium: "asc" }, { nameNl: "asc" }],
    select: { id: true, nameNl: true, nameEn: true },
  });

  return (
    <div className="space-y-5">
      <header>
        <Link
          href={backHref}
          className="text-sm font-medium text-[#5c667f] underline underline-offset-4"
        >
          {nl ? "← Terug naar de lijst" : "← Back to the list"}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{nl ? "Rekening bewerken" : "Edit expense"}</h1>
        <p className="mt-1 max-w-5xl text-sm text-[#5c667f]">
          {nl
            ? "Laat je het bonnetje ongemoeid, dan blijft het huidige staan. Kies je een nieuw bestand, dan vervangt het het oude en wordt dat uit de opslag gewist."
            : "Leave the receipt alone and the current one stays. Pick a new file and it replaces the old one, which is then removed from storage."}
        </p>
      </header>

      <div className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <ExpenseForm
          locale={nl ? "nl" : "en"}
          action={updateExpenseAction}
          posts={groups.map((group) => ({
            id: group.id,
            name: pick(group.nameNl, group.nameEn, locale),
          }))}
          values={{
            id: expense.id,
            groupId: expense.groupId ?? "",
            payerName: expense.payerName,
            activity: expense.activity,
            description: expense.description,
            spentOn: toDateInputValue(expense.spentOn),
            amount: formatAmount(expense.amountCents, locale),
            paymentMethod: expense.paymentMethod,
            iban: expense.iban ?? "",
          }}
          existingReceipt={{
            key: expense.receiptKey,
            name: expense.receiptName,
            mime: expense.receiptMime,
            size: expense.receiptSize,
            previewUrl: expense.receiptMime.startsWith("image/")
              ? `/api/admin/rekeningen/${expense.id}/bon`
              : "",
          }}
          redirectAfter={backHref}
          labels={{
            submitLabel: nl ? "Wijzigingen opslaan" : "Save changes",
            savingLabel: nl ? "Opslaan..." : "Saving...",
            savedMessage: nl ? "Rekening bijgewerkt." : "Expense updated.",
            fallbackErrorMessage: nl ? "Opslaan mislukt." : "Could not save.",
            errorMessages: expenseErrorMessages(locale),
          }}
        />
      </div>
    </div>
  );
}
