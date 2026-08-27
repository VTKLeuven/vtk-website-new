import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@vtk/i18n";
import {
  deleteExpenseAction,
  sendExpenseAction,
  setExpenseStateAction,
} from "@/app/actions/expenses";
import {
  expenseStatusLabel,
  formatBytes,
  formatEuro,
  formatIban,
  type ExpenseStatus,
} from "@/lib/rekeningen/expenses";
import { ExpenseActionBar } from "./ExpenseActionBar";
import { ExpenseStateToggles } from "./ExpenseStateToggles";
import { expenseErrorMessages } from "./messages";

/**
 * De werkbank: de lijst links, de rekening die je bekeek rechts.
 *
 * Beide kanten worden serverkant gerenderd; de selectie zit in `?sel=` in de
 * URL. Zo is een geopende rekening een deelbare link, blijft de lijst een gewone
 * server-tabel die met tienduizend rijen overweg kan, en is er geen clientstate
 * die uit de pas kan lopen met de database. Enkel de vinkjes, het
 * voorbeeldvenster en verwijderen zijn client.
 */

export type ExpenseRow = {
  id: string;
  spentOnLabel: string;
  description: string;
  activity: string;
  payerName: string;
  postLabel: string;
  amountCents: number;
  status: ExpenseStatus;
  paymentMethod: "VTK_CARD" | "PERSONAL";
};

export type ExpenseDetail = ExpenseRow & {
  iban: string | null;
  submittedByName: string | null;
  submittedAtLabel: string;
  receiptName: string;
  receiptMime: string;
  receiptSize: number;
  paidAtLabel: string | null;
  paidByName: string | null;
  bookedAtLabel: string | null;
  bookedByName: string | null;
  sentAtLabel: string | null;
  sentTo: string | null;
  canEdit: boolean;
};

export function ExpenseWorkbench({
  locale,
  rows,
  total,
  totalCents,
  selected,
  hrefForRow,
  pagination,
  emptyMessage,
  canManageState,
  accountantEmail,
  editHrefFor,
}: {
  locale: Locale;
  rows: ExpenseRow[];
  total: number;
  totalCents: number;
  selected: ExpenseDetail | null;
  /** Link naar dezelfde pagina met deze rekening geopend. */
  hrefForRow: (id: string) => string;
  pagination: { page: number; pages: number; hrefFor: (page: number) => string };
  emptyMessage: string;
  canManageState: boolean;
  accountantEmail: string;
  editHrefFor: (id: string) => string;
}) {
  const nl = locale === "nl";

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
      <div className="overflow-hidden rounded-2xl border border-vtk-blue/12 bg-white">
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-[#5c667f]">{emptyMessage}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th scope="col">{nl ? "Datum" : "Date"}</th>
                  <th scope="col">{nl ? "Omschrijving" : "Description"}</th>
                  <th scope="col">{nl ? "Post" : "Post"}</th>
                  <th scope="col" className="text-right">
                    {nl ? "Bedrag" : "Amount"}
                  </th>
                  <th scope="col">{nl ? "Status" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isSelected = selected?.id === row.id;
                  return (
                    <tr
                      key={row.id}
                      // `relative` draagt de uitgerekte link hieronder: zo is de
                      // hele rij klikbaar terwijl er maar één echte link staat,
                      // met de omschrijving als toegankelijke naam.
                      className={`relative ${isSelected ? "bg-vtk-yellow/12" : ""}`}
                    >
                      <td className="whitespace-nowrap tabular-nums text-[#34405e]">
                        {row.spentOnLabel}
                      </td>
                      <td>
                        <Link
                          href={hrefForRow(row.id)}
                          scroll={false}
                          className="font-semibold text-vtk-ink after:absolute after:inset-0 after:content-['']"
                        >
                          {row.description}
                        </Link>
                        <span className="block text-xs font-normal text-[#5c667f]">
                          {row.activity} · {row.payerName}
                        </span>
                      </td>
                      <td className="text-[#34405e]">{row.postLabel}</td>
                      <td className="whitespace-nowrap text-right font-semibold tabular-nums text-vtk-ink">
                        {formatEuro(row.amountCents, locale)}
                      </td>
                      <td>
                        <StatusPill status={row.status} locale={locale} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-vtk-blue/10 px-4 py-2.5 text-xs text-[#5c667f]">
          <span>
            {nl
              ? `${total} ${total === 1 ? "rekening" : "rekeningen"} · ${formatEuro(totalCents, locale)} samen`
              : `${total} ${total === 1 ? "expense" : "expenses"} · ${formatEuro(totalCents, locale)} together`}
          </span>
          {pagination.pages > 1 && (
            <nav className="flex items-center gap-1" aria-label={nl ? "Paginering" : "Pagination"}>
              {pagination.page > 1 && (
                <Link href={pagination.hrefFor(pagination.page - 1)} className="rounded-lg border border-vtk-blue/15 px-2 py-1">
                  {nl ? "Vorige" : "Previous"}
                </Link>
              )}
              <span className="px-2 tabular-nums">
                {pagination.page} / {pagination.pages}
              </span>
              {pagination.page < pagination.pages && (
                <Link href={pagination.hrefFor(pagination.page + 1)} className="rounded-lg border border-vtk-blue/15 px-2 py-1">
                  {nl ? "Volgende" : "Next"}
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>

      <aside className="xl:sticky xl:top-4">
        {selected ? (
          <Inspector
            locale={locale}
            expense={selected}
            canManageState={canManageState}
            accountantEmail={accountantEmail}
            editHref={editHrefFor(selected.id)}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-vtk-blue/20 bg-white/60 px-5 py-10 text-center text-sm text-[#5c667f]">
            {nl
              ? "Klik op een rekening om het bonnetje en de gegevens ernaast te zien."
              : "Click an expense to see its receipt and details alongside."}
          </div>
        )}
      </aside>
    </div>
  );
}

function Inspector({
  locale,
  expense,
  canManageState,
  accountantEmail,
  editHref,
}: {
  locale: Locale;
  expense: ExpenseDetail;
  canManageState: boolean;
  accountantEmail: string;
  editHref: string;
}) {
  const nl = locale === "nl";
  const errorMessages = expenseErrorMessages(locale);
  const isImage = expense.receiptMime.startsWith("image/");
  const receiptUrl = `/api/admin/rekeningen/${expense.id}/bon`;

  return (
    <div className="overflow-hidden rounded-2xl border border-vtk-blue/12 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-vtk-blue/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-vtk-ink">{expense.description}</h2>
          <p className="mt-0.5 text-xs text-[#5c667f]">
            {expense.postLabel} · {expense.activity} · {expense.spentOnLabel}
          </p>
        </div>
        <StatusPill status={expense.status} locale={locale} />
      </div>

      <div className="space-y-4 px-4 py-4">
        <a
          href={receiptUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/50 p-2.5 transition-colors hover:border-vtk-blue/25"
        >
          <span className="relative grid h-20 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-vtk-blue/12 bg-white">
            {isImage ? (
              // Onbewerkt: het bonnetje zit achter een login en de beeldoptimizer
              // stuurt geen sessiecookie mee, dus die zou een 403 binnenhalen.
              <Image
                src={receiptUrl}
                alt=""
                fill
                sizes="64px"
                unoptimized
                className="object-cover"
              />
            ) : (
              <span className="flex flex-col items-center gap-1 text-[#5c667f]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                <span className="text-[9px] font-semibold uppercase tracking-wide">PDF</span>
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-vtk-ink">
              {expense.receiptName}
            </span>
            <span className="block text-xs text-[#5c667f]">
              {formatBytes(expense.receiptSize, locale)} ·{" "}
              {nl ? "openen in een nieuw tabblad" : "open in a new tab"}
            </span>
          </span>
        </a>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <Row label={nl ? "Bedrag" : "Amount"}>
            <span className="font-semibold tabular-nums">
              {formatEuro(expense.amountCents, locale)}
            </span>
          </Row>
          <Row label={nl ? "Betaald met" : "Paid with"}>
            {expense.paymentMethod === "VTK_CARD"
              ? nl
                ? "Kaart VTK"
                : "VTK card"
              : nl
                ? "Eigen kaart"
                : "Own card"}
          </Row>
          {expense.iban && (
            <Row label="IBAN">
              <span className="tabular-nums">{formatIban(expense.iban)}</span>
            </Row>
          )}
          <Row label={nl ? "Wie betaalde" : "Who paid"}>{expense.payerName}</Row>
          <Row label={nl ? "Ingediend" : "Submitted"}>
            {[expense.submittedAtLabel, expense.submittedByName].filter(Boolean).join(" · ")}
          </Row>
        </dl>

        <ExpenseStateToggles
          expenseId={expense.id}
          locale={nl ? "nl" : "en"}
          action={setExpenseStateAction}
          paidAt={expense.paidAtLabel}
          paidBy={expense.paidByName}
          bookedAt={expense.bookedAtLabel}
          bookedBy={expense.bookedByName}
          sentAt={expense.sentAtLabel}
          sentTo={expense.sentTo}
          readOnly={!canManageState}
          labels={{
            savedMessage: nl ? "Opgeslagen." : "Saved.",
            fallbackErrorMessage: nl ? "Opslaan mislukt." : "Could not save.",
            errorMessages,
          }}
        />
      </div>

      <ExpenseActionBar
        expenseId={expense.id}
        locale={nl ? "nl" : "en"}
        editHref={editHref}
        canEdit={expense.canEdit}
        canSend={canManageState}
        defaultRecipient={accountantEmail}
        sendAction={sendExpenseAction}
        deleteAction={deleteExpenseAction}
        deleteDescription={
          nl
            ? `"${expense.description}" (${formatEuro(expense.amountCents, locale)}, ${expense.postLabel}) verdwijnt samen met het bonnetje uit de opslag. Al doorgestuurde bladen bij de boekhouder blijven uiteraard staan.`
            : `"${expense.description}" (${formatEuro(expense.amountCents, locale)}, ${expense.postLabel}) disappears together with the receipt in storage. Sheets already forwarded to the accountant of course stay put.`
        }
        labels={{
          savedMessage: nl ? "Opgeslagen." : "Saved.",
          sentMessage: nl ? "Blad verstuurd naar de boekhouding." : "Sheet sent to the accountant.",
          fallbackErrorMessage: nl ? "Er ging iets mis." : "Something went wrong.",
          errorMessages,
        }}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5c667f]">
        {label}
      </dt>
      <dd className="m-0 min-w-0 break-words text-vtk-ink">{children}</dd>
    </>
  );
}

const PILL_TONES: Record<ExpenseStatus, string> = {
  TO_REIMBURSE: "bg-yellow-100 text-yellow-900",
  TO_SEND: "bg-vtk-blue/10 text-vtk-ink",
  TO_BOOK: "bg-vtk-blue-soft text-[#34405e]",
  DONE: "bg-green-100 text-green-800",
};

export function StatusPill({ status, locale }: { status: ExpenseStatus; locale: Locale }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${PILL_TONES[status]}`}
    >
      {expenseStatusLabel(status, locale === "nl")}
    </span>
  );
}
