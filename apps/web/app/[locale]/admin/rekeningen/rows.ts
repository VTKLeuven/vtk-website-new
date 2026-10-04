import "server-only";

import type { Expense } from "@prisma/client";
import type { Locale } from "@vtk/i18n";
import {
  expenseMailDraft,
  expenseReportFilename,
  expenseStatus,
  formatDayMonth,
  formatMoment,
  formatSpentOn,
  formatSubmittedOn,
  reimbursementReference,
  reimbursementState,
} from "@/lib/rekeningen/expenses";
import { canDelete, canEdit, type ExpenseAccess } from "@/lib/rekeningen/server";
import type { ExpenseDetail, ExpenseRow } from "./ExpenseWorkbench";

/** Wat de lijst en de inspector aan relaties nodig hebben. */
export const expenseInclude = {
  submittedBy: { select: { name: true } },
  paidBy: { select: { name: true } },
  bookedBy: { select: { name: true } },
} as const;

type WithNames = Expense & {
  submittedBy?: { name: string } | null;
  paidBy?: { name: string } | null;
  bookedBy?: { name: string } | null;
};

/**
 * Eén rij voor de lijst.
 *
 * Wie geen volledig beheer heeft, ziet enkel of er terugbetaald is (zie
 * `reimbursementState`). Doorsturen en inboeken gaan dan ook niet mee naar de
 * browser: wat niet getoond wordt, hoort ook niet in de HTML te staan.
 */
export function toRow(
  expense: WithNames,
  locale: Locale,
  access?: ExpenseAccess | null,
): ExpenseRow {
  const full = access?.canManageAll ?? false;
  return {
    id: expense.id,
    spentOnLabel: formatSpentOn(expense.spentOn, locale),
    submittedOnLabel: formatSubmittedOn(expense.createdAt, locale),
    spentOnShort: formatDayMonth(expense.spentOn, "UTC", locale),
    submittedOnShort: formatDayMonth(expense.createdAt, "Europe/Brussels", locale),
    description: expense.description,
    activity: expense.activity,
    payerName: expense.payerName,
    postLabel: expense.postLabel,
    amountCents: expense.amountCents,
    status: full ? expenseStatus(expense) : null,
    reimbursement: reimbursementState(expense),
    paymentMethod: expense.paymentMethod,
    paidAtLabel: expense.paidAt ? formatMoment(expense.paidAt, locale) : null,
    paidByName: expense.paidBy?.name ?? null,
    bookedAtLabel: full && expense.bookedAt ? formatMoment(expense.bookedAt, locale) : null,
    bookedByName: full ? (expense.bookedBy?.name ?? null) : null,
    sentAtLabel: full && expense.sentAt ? formatMoment(expense.sentAt, locale) : null,
    sentTo: full ? expense.sentTo : null,
    canEdit: access ? canEdit(access, expense) : false,
    canDelete: access ? canDelete(access, expense) : false,
    receiptName: expense.receiptName,
    receiptMime: expense.receiptMime,
    unseen: false,
    mail: {
      ...expenseMailDraft(expense),
      attachmentName: expenseReportFilename(expense),
    },
  };
}

export function toDetail(
  expense: WithNames,
  locale: Locale,
  access: ExpenseAccess,
): ExpenseDetail {
  return {
    ...toRow(expense, locale, access),
    comment: expense.comment,
    iban: expense.iban,
    // Enkel voor wie terugbetaalt: het is de tekst voor de overschrijving.
    reimbursementReference:
      access.canManageAll && expense.paymentMethod === "PERSONAL"
        ? reimbursementReference(expense)
        : null,
    submittedByName: expense.submittedBy?.name ?? null,
    submittedAtLabel: formatMoment(expense.createdAt, locale),
    receiptSize: expense.receiptSize,
  };
}
