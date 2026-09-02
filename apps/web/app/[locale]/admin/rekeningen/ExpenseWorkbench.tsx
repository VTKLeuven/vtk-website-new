"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Locale } from "@vtk/i18n";
import { Modal } from "@/app/[locale]/admin/admin-table";
import { IconButton, IconLink, RowActions } from "@/components/ui/IconButton";
import { CardIcon, PencilIcon, UserIcon } from "@/components/ui/icons";
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
import { BladModal } from "./BladModal";
import { ExpenseActionBar } from "./ExpenseActionBar";
import { ExpenseStateToggles } from "./ExpenseStateToggles";
import { expenseErrorMessages } from "./messages";

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
  paidAtLabel: string | null;
  paidByName: string | null;
  bookedAtLabel: string | null;
  bookedByName: string | null;
  sentAtLabel: string | null;
  sentTo: string | null;
  canEdit: boolean;
  canDelete: boolean;
  receiptName: string;
  receiptMime: string;
  mail: { from?: string; subject: string; body: string; attachmentName: string };
};

export type ExpenseDetail = ExpenseRow & {
  iban: string | null;
  submittedByName: string | null;
  submittedAtLabel: string;
  receiptSize: number;
};

type LinkedExpenseRow = ExpenseRow & { detailHref: string; editHref: string };
type LinkedExpenseDetail = ExpenseDetail & { editHref: string };

export function ExpenseWorkbench({
  locale,
  rows,
  total,
  totalCents,
  selected,
  hrefWithoutSel,
  pagination,
  emptyMessage,
  canManageState,
  accountantEmail,
  senderEmail,
}: {
  locale: Locale;
  rows: LinkedExpenseRow[];
  total: number;
  totalCents: number;
  selected: LinkedExpenseDetail | null;
  hrefWithoutSel: string;
  pagination: {
    page: number;
    pages: number;
    previousHref: string | null;
    nextHref: string | null;
  };
  emptyMessage: string;
  canManageState: boolean;
  accountantEmail: string;
  senderEmail: string;
}) {
  const nl = locale === "nl";
  const router = useRouter();

  // Snelle actie direct vanuit de tabel zonder eerst het detailpaneel te moeten openen
  const [activeBlad, setActiveBlad] = useState<{
    expenseId: string;
    mode: "download" | "send";
    mail: { from: string; subject: string; body: string; attachmentName: string };
  } | null>(null);

  const errorMessages = expenseErrorMessages(locale);

  return (
    <div className="w-full space-y-4">
      <div className="overflow-hidden rounded-2xl border border-vtk-blue/12 bg-white">
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-[#5c667f]">{emptyMessage}</p>
        ) : (
          <>
            <p className="vtk-expense-legend">
              <span>{nl ? "Voortgang:" : "Progress:"}</span>
              <span>
                <TrackSample state="done" />
                <b>{nl ? "1 terugbetaald" : "1 reimbursed"}</b>
              </span>
              <span>
                <TrackSample state="done" />
                <b>{nl ? "2 doorgestuurd" : "2 forwarded"}</b>
              </span>
              <span>
                <TrackSample state="done" />
                <b>{nl ? "3 ingeboekt" : "3 booked"}</b>
              </span>
              <span>
                <TrackSample state="open" />
                {nl ? "nog niet" : "not yet"}
              </span>
              <span>
                <TrackSample state="na" />
                {nl ? "n.v.t. bij de VTK-kaart" : "n/a with the VTK card"}
              </span>
            </p>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/10 text-left text-xs font-semibold text-[#5c667f]">
                  <th scope="col" className="w-[96px] px-4 py-3">{nl ? "Datum" : "Date"}</th>
                  <th scope="col" className="px-4 py-3">{nl ? "Omschrijving" : "Description"}</th>
                  <th scope="col" className="w-[104px] px-4 py-3 text-right">{nl ? "Bedrag" : "Amount"}</th>
                  <th scope="col" className="w-[64px] px-4 py-3">{nl ? "Kaart" : "Card"}</th>
                  <th scope="col" className="w-[190px] px-4 py-3">{nl ? "Voortgang" : "Progress"}</th>
                  <th scope="col" className="w-[124px] px-4 py-3 text-right">{nl ? "Acties" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vtk-blue/5">
                {rows.map((row) => {
                  const isSelected = selected?.id === row.id;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => router.push(row.detailHref, { scroll: false })}
                      className={`group cursor-pointer transition-colors hover:bg-vtk-blue-soft/30 ${
                        isSelected ? "bg-vtk-yellow/12" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[#34405e]">
                        {row.spentOnLabel}
                      </td>
                      <td className="px-4 py-3">
                        {/* De hele rij opent de rekening; deze knop is wat een
                            toetsenbord vindt en wat een screenreader voorleest. */}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(row.detailHref, { scroll: false });
                          }}
                          className="text-left font-semibold text-vtk-ink hover:underline"
                        >
                          {row.description}
                        </button>
                        <span className="block text-xs font-normal text-[#5c667f]">
                          {row.postLabel} · {row.activity} · {row.payerName}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-vtk-ink">
                        {formatEuro(row.amountCents, locale)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className="vtk-expense-method"
                          title={
                            row.paymentMethod === "VTK_CARD"
                              ? nl
                                ? "Betaald met de kaart van VTK"
                                : "Paid with the VTK card"
                              : nl
                                ? "Met eigen kaart voorgeschoten"
                                : "Paid out of own pocket"
                          }
                        >
                          {row.paymentMethod === "VTK_CARD" ? <CardIcon /> : <UserIcon />}
                          <span className="sr-only">
                            {row.paymentMethod === "VTK_CARD"
                              ? nl
                                ? "VTK-kaart"
                                : "VTK card"
                              : nl
                                ? "Eigen kaart"
                                : "Own card"}
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <ExpenseTrack
                          card={row.paymentMethod === "VTK_CARD"}
                          paid={Boolean(row.paidAtLabel)}
                          sent={Boolean(row.sentAtLabel)}
                          booked={Boolean(row.bookedAtLabel)}
                          locale={locale}
                          hints={{
                            paidAt: row.paidAtLabel,
                            paidBy: row.paidByName,
                            bookedAt: row.bookedAtLabel,
                            bookedBy: row.bookedByName,
                            sentAt: row.sentAtLabel,
                            sentTo: row.sentTo,
                          }}
                        />
                        <span className="vtk-expense-status" data-status={row.status}>
                          {expenseStatusLabel(row.status, nl)}
                        </span>
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3 text-right"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <RowActions>
                          <IconButton
                            label={nl ? "Blad bekijken" : "View sheet"}
                            srLabel={`${nl ? "Blad bekijken" : "View sheet"}: ${row.description}`}
                            onClick={() =>
                              setActiveBlad({
                                expenseId: row.id,
                                mode: "download",
                                mail: { ...row.mail, from: senderEmail },
                              })
                            }
                          >
                            <DocumentIcon />
                          </IconButton>
                          {canManageState && (
                            <IconButton
                              label={nl ? "Doorsturen naar boekhouder" : "Forward to accountant"}
                              srLabel={`${nl ? "Doorsturen" : "Forward"}: ${row.description}`}
                              onClick={() =>
                                setActiveBlad({
                                  expenseId: row.id,
                                  mode: "send",
                                  mail: { ...row.mail, from: senderEmail },
                                })
                              }
                            >
                              <SendIcon />
                            </IconButton>
                          )}
                          {row.canEdit && (
                            <IconLink
                              href={row.editHref}
                              label={nl ? "Bewerken" : "Edit"}
                              srLabel={`${nl ? "Bewerken" : "Edit"}: ${row.description}`}
                            >
                              <PencilIcon />
                            </IconLink>
                          )}
                        </RowActions>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-vtk-blue/10 px-4 py-2.5 text-xs text-[#5c667f]">
          <span>
            {nl
              ? `${total} ${total === 1 ? "rekening" : "rekeningen"} · ${formatEuro(totalCents, locale)} samen`
              : `${total} ${total === 1 ? "expense" : "expenses"} · ${formatEuro(totalCents, locale)} together`}
          </span>
          {pagination.pages > 1 && (
            <nav className="flex items-center gap-1" aria-label={nl ? "Paginering" : "Pagination"}>
              {pagination.previousHref && (
                <Link
                  href={pagination.previousHref}
                  className="rounded-lg border border-vtk-blue/15 px-2 py-1 hover:bg-vtk-blue-soft/50"
                >
                  {nl ? "Vorige" : "Previous"}
                </Link>
              )}
              <span className="px-2 tabular-nums">
                {pagination.page} / {pagination.pages}
              </span>
              {pagination.nextHref && (
                <Link
                  href={pagination.nextHref}
                  className="rounded-lg border border-vtk-blue/15 px-2 py-1 hover:bg-vtk-blue-soft/50"
                >
                  {nl ? "Volgende" : "Next"}
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>

      {/* Modal voor geopende rekening */}
      {selected && (
        <ExpenseDetailModal
          locale={locale}
          expense={selected}
          canManageState={canManageState}
          accountantEmail={accountantEmail}
          senderEmail={senderEmail}
          editHref={selected.editHref}
          onClose={() => router.push(hrefWithoutSel, { scroll: false })}
        />
      )}

      {/* Direct blad downloaden of versturen vanuit tabelrij */}
      {activeBlad && (
        <BladModal
          expenseId={activeBlad.expenseId}
          locale={nl ? "nl" : "en"}
          mode={activeBlad.mode}
          defaultRecipient={activeBlad.mode === "send" ? accountantEmail : undefined}
          mail={activeBlad.mail}
          sendAction={sendExpenseAction}
          labels={{
            savedMessage: nl ? "Blad verstuurd naar de boekhouding." : "Sheet sent to the accountant.",
            fallbackErrorMessage: nl ? "Er ging iets mis." : "Something went wrong.",
            errorMessages,
          }}
          onClose={() => setActiveBlad(null)}
        />
      )}
    </div>
  );
}

function ExpenseDetailModal({
  locale,
  expense,
  canManageState,
  accountantEmail,
  senderEmail,
  editHref,
  onClose,
}: {
  locale: Locale;
  expense: ExpenseDetail;
  canManageState: boolean;
  accountantEmail: string;
  senderEmail: string;
  editHref: string;
  onClose: () => void;
}) {
  const nl = locale === "nl";
  const errorMessages = expenseErrorMessages(locale);
  const isImage = expense.receiptMime.startsWith("image/");
  const receiptUrl = `/api/admin/rekeningen/${expense.id}/bon`;

  return (
    <Modal
      title={expense.description}
      size="lg"
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-vtk-blue/10 pb-3">
          <div className="text-xs text-[#5c667f]">
            {expense.postLabel} · {expense.activity} · {expense.spentOnLabel}
          </div>
          <StatusPill status={expense.status} locale={locale} />
        </div>

        {/* Bonnetjeskaart */}
        <a
          href={receiptUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/50 p-2.5 transition-colors hover:border-vtk-blue/25"
        >
          <span className="relative grid h-20 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-vtk-blue/12 bg-white">
            {isImage ? (
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

        {/* Gegevenslijst */}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <Row label={nl ? "Bedrag" : "Amount"}>
            <span className="font-semibold tabular-nums text-vtk-ink">
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

        {/* Toggles voor statussen */}
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

        {/* Actiebalk */}
        <div className="-mx-5 -mb-4 mt-4">
          <ExpenseActionBar
            expenseId={expense.id}
            locale={nl ? "nl" : "en"}
            editHref={editHref}
            canEdit={expense.canEdit}
            canDelete={expense.canDelete}
            canSend={canManageState}
            defaultRecipient={accountantEmail}
            mail={{ ...expense.mail, from: senderEmail }}
            sendAction={sendExpenseAction}
            deleteAction={deleteExpenseAction}
            deleteDescription={
              nl
                ? `"${expense.description}" (${formatEuro(expense.amountCents, locale)}, ${expense.postLabel}) verdwijnt samen met het bonnetje uit de opslag.`
                : `"${expense.description}" (${formatEuro(expense.amountCents, locale)}, ${expense.postLabel}) disappears together with the receipt in storage.`
            }
            labels={{
              savedMessage: nl ? "Opgeslagen." : "Saved.",
              sentMessage: nl ? "Blad verstuurd naar de boekhouding." : "Sheet sent to the accountant.",
              fallbackErrorMessage: nl ? "Er ging iets mis." : "Something went wrong.",
              errorMessages,
            }}
          />
        </div>
      </div>
    </Modal>
  );
}

type TrackStep = "done" | "open" | "na";

/**
 * Drie segmenten naast elkaar: terugbetaald, doorgestuurd, ingeboekt. Ze
 * vervangen de drie kolommen met pillen die daar stonden, en houden dezelfde
 * volgorde aan als de werkstroom zelf.
 *
 * `aria-hidden`, want het statuswoord ernaast zegt hetzelfde in woorden; de
 * tooltips zijn er voor wie met de muis wil weten wanneer en door wie.
 */
function ExpenseTrack({
  card,
  paid,
  sent,
  booked,
  locale,
  hints,
}: {
  card: boolean;
  paid: boolean;
  sent: boolean;
  booked: boolean;
  locale: Locale;
  hints: { paidAt: string | null; paidBy: string | null; bookedAt: string | null; bookedBy: string | null; sentAt: string | null; sentTo: string | null };
}) {
  const nl = locale === "nl";
  const by = (who: string | null) => (who ? ` · ${nl ? "door" : "by"} ${who}` : "");

  const steps: { key: string; state: TrackStep; title: string }[] = [
    {
      key: "paid",
      state: card ? "na" : paid ? "done" : "open",
      title: card
        ? nl
          ? "Terugbetalen: niet nodig, met de kaart van VTK betaald"
          : "Reimbursement: not needed, paid with the VTK card"
        : paid
          ? `${nl ? "Terugbetaald" : "Reimbursed"}: ${hints.paidAt}${by(hints.paidBy)}`
          : nl
            ? "Terugbetaald: nog niet"
            : "Reimbursed: not yet",
    },
    {
      key: "sent",
      state: sent ? "done" : "open",
      title: sent
        ? `${nl ? "Doorgestuurd" : "Forwarded"}: ${hints.sentAt}${hints.sentTo ? ` · ${nl ? "naar" : "to"} ${hints.sentTo}` : ""}`
        : nl
          ? "Doorgestuurd: nog niet"
          : "Forwarded: not yet",
    },
    {
      key: "booked",
      state: booked ? "done" : "open",
      title: booked
        ? `${nl ? "Ingeboekt" : "Booked"}: ${hints.bookedAt}${by(hints.bookedBy)}`
        : nl
          ? "Ingeboekt: nog niet"
          : "Booked: not yet",
    },
  ];

  return (
    <span className="vtk-expense-track" aria-hidden>
      {steps.map((step) => (
        <i key={step.key} data-step={step.state} title={step.title} />
      ))}
    </span>
  );
}

/** Eén segment, voor de legende boven de tabel. */
function TrackSample({ state }: { state: TrackStep }) {
  return (
    <span className="vtk-expense-track" aria-hidden>
      <i data-step={state} />
    </span>
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

function DocumentIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
