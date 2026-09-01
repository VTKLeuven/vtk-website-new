import "server-only";

import type { Expense } from "@prisma/client";
import type { Locale } from "@vtk/i18n";
import {
  expenseMailDraft,
  expenseReportFilename,
  expenseStatus,
  formatMoment,
  formatSpentOn,
} from "@/lib/rekeningen/expenses";
import { canEdit, type ExpenseAccess } from "@/lib/rekeningen/server";
import type { ExpenseDetail, ExpenseRow } from "./ExpenseWorkbench";

/** Wat de lijst en de inspector aan relaties nodig hebben. */
export const expenseInclude = {
  submittedBy: { select: { name: true } },
  paidBy: { select: { name: true } },
  bookedBy: { select: { name: true } },
} as const;

type WithNames = Expense & {
  submittedBy: { name: string } | null;
  paidBy: { name: string } | null;
  bookedBy: { name: string } | null;
};

export function toRow(expense: Expense, locale: Locale): ExpenseRow {
  return {
    id: expense.id,
    spentOnLabel: formatSpentOn(expense.spentOn, locale),
    description: expense.description,
    activity: expense.activity,
    payerName: expense.payerName,
    postLabel: expense.postLabel,
    amountCents: expense.amountCents,
    status: expenseStatus(expense),
    paymentMethod: expense.paymentMethod,
  };
}

export function toDetail(
  expense: WithNames,
  locale: Locale,
  access: ExpenseAccess,
): ExpenseDetail {
  return {
    ...toRow(expense, locale),
    iban: expense.iban,
    submittedByName: expense.submittedBy?.name ?? null,
    submittedAtLabel: formatMoment(expense.createdAt, locale),
    receiptName: expense.receiptName,
    receiptMime: expense.receiptMime,
    receiptSize: expense.receiptSize,
    paidAtLabel: expense.paidAt ? formatMoment(expense.paidAt, locale) : null,
    paidByName: expense.paidBy?.name ?? null,
    bookedAtLabel: expense.bookedAt ? formatMoment(expense.bookedAt, locale) : null,
    bookedByName: expense.bookedBy?.name ?? null,
    sentAtLabel: expense.sentAt ? formatMoment(expense.sentAt, locale) : null,
    sentTo: expense.sentTo,
    canEdit: canEdit(access, expense),
    // De mail naar de boekhouding wordt hier al opgesteld, met dezelfde functie
    // als de action die ze verstuurt, zodat het voorbeeldvenster geen tweede
    // versie van die tekst hoeft te verzinnen.
    mail: {
      ...expenseMailDraft(expense),
      attachmentName: expenseReportFilename(expense),
    },
  };
}
