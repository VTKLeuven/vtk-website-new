"use client";

import { useState, type MouseEvent } from "react";
import Link from "@/components/ui/Link";
import { ConfirmTextButton, DeleteButton } from "@/components/ui/DeleteIconButton";
import type { AccountingCodeOption } from "@/lib/accounting/codes";
import type { SaveAction, SaveState } from "@/lib/saveState";
import { Modal } from "../../admin-table";
import { LendingForm, type LendingChannelOption } from "./LendingForm";

/** Een uitlening zoals de lijst ze toont; de teksten maakt de server, zodat ze niet verspringen. */
export type LendingListItem = {
  id: string;
  channelId: string;
  channel: string;
  from: string;
  to: string;
  /** "16 tot en met 23 sep 2026" */
  daysLabel: string;
  code: { id: string; label: string } | null;
  linkedCount: number;
  /** "336 transacties, € 41.228,86" */
  linkedLabel: string;
  transactionsHref: string;
  manualCount: number;
  manualHref: string;
  takeOverCount: number;
  /** "336 betalingen, € 41.228,86" */
  takeOverLabel: string;
  /** "Jan Peeters, 21 nov", met "aangepast door ..." erachter wanneer iemand ze wijzigde. */
  setBy: string;
  locked: boolean;
};

/** Klikken op een link of knop in een rij opent de uitlening niet. */
function ownsClick(event: MouseEvent): boolean {
  return Boolean((event.target as HTMLElement).closest("a, button, input, label, [data-row-action]"));
}

export function LendingList({
  items,
  channels,
  codes,
  locale,
  saveAction,
  deleteAction,
  takeOverAction,
  errorMessages,
}: {
  items: LendingListItem[];
  channels: LendingChannelOption[];
  codes: AccountingCodeOption[];
  locale: "nl" | "en";
  saveAction: SaveAction;
  deleteAction: (formData: FormData) => Promise<SaveState>;
  takeOverAction: (formData: FormData) => Promise<SaveState>;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const [openId, setOpenId] = useState<string | null>(null);
  // Na verwijderen staat ze niet meer in de lijst: dan sluit de modal vanzelf.
  const open = items.find((item) => item.id === openId) ?? null;

  if (items.length === 0) {
    return (
      <p className="text-sm text-vtk-muted">
        {nl
          ? "Nog geen uitleningen. Wat je hierboven uitleent, staat hier met het aantal transacties."
          : "No lendings yet. What you lend out above shows up here with its number of transactions."}
      </p>
    );
  }

  return (
    <>
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-vtk-blue/12 text-left text-xs uppercase tracking-wide text-vtk-muted">
              <th className="py-2 pr-3">{nl ? "Kanaal" : "Channel"}</th>
              <th className="px-3 py-2">{nl ? "Dagen" : "Days"}</th>
              <th className="px-3 py-2">{nl ? "Code" : "Code"}</th>
              <th className="px-3 py-2">{nl ? "Transacties" : "Transactions"}</th>
              <th className="px-3 py-2">{nl ? "Gezet door" : "Set by"}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                onClick={(event) => {
                  if (!ownsClick(event)) setOpenId(item.id);
                }}
                className="cursor-pointer border-b border-vtk-blue/8 align-top last:border-0 hover:bg-vtk-blue-soft/40"
              >
                <td className="py-2 pr-3">
                  {/* De echte knop voor wie met het toetsenbord of een screenreader werkt; de rij zelf klikt ook. */}
                  <button
                    type="button"
                    onClick={() => setOpenId(item.id)}
                    className="text-left font-medium hover:underline"
                    aria-label={nl ? `Aanpassen: ${item.channel}, ${item.daysLabel}` : `Edit: ${item.channel}, ${item.daysLabel}`}
                  >
                    {item.channel}
                  </button>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{item.daysLabel}</td>
                <td className="px-3 py-2">
                  {item.code ? item.code.label : <span className="text-vtk-warn">{nl ? "Code verwijderd" : "Code deleted"}</span>}
                </td>
                <td className="px-3 py-2" data-row-action>
                  <Link href={item.transactionsHref} className="tabular-nums underline underline-offset-2 hover:text-vtk-navy">
                    {item.linkedLabel}
                  </Link>
                  {item.manualCount > 0 ? (
                    <Link href={item.manualHref} className="block text-xs text-vtk-muted underline underline-offset-2 hover:text-vtk-navy">
                      {nl ? `${item.manualCount} met de hand gezet op die dagen` : `${item.manualCount} set by hand on those days`}
                    </Link>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-vtk-muted">{item.setBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <Modal title={nl ? "Uitlening aanpassen" : "Edit lending"} onClose={() => setOpenId(null)} size="lg">
          <div className="space-y-5">
            <LendingForm
              key={open.id}
              channels={channels}
              codes={codes}
              locale={locale}
              action={saveAction}
              errorMessages={errorMessages}
              lending={{ id: open.id, channelId: open.channelId, from: open.from, to: open.to, accountingCodeId: open.code?.id ?? null }}
              onSaved={() => setOpenId(null)}
            />
            <TakeOver item={open} locale={locale} action={takeOverAction} errorMessages={errorMessages} />
            <div className="border-t border-vtk-blue/10 pt-4">
              {open.locked ? (
                <p className="text-sm text-vtk-muted">
                  {nl
                    ? "Een deel van haar transacties valt in een afgesloten periode: verwijderen kan pas wanneer die heropend is (Instellingen)."
                    : "Part of its transactions fall in a closed period: it can only be deleted once that is reopened (Settings)."}
                </p>
              ) : (
                <DeleteButton
                  action={deleteAction}
                  fields={{ id: open.id }}
                  title={nl ? "Deze uitlening verwijderen?" : "Delete this lending?"}
                  description={
                    nl
                      ? `${open.linkedLabel} van ${open.channel}, ${open.daysLabel}, ${open.linkedCount === 1 ? "verliest" : "verliezen"} ${open.code ? `code ${open.code.label}` : "deze uitlening"} en ${open.linkedCount === 1 ? "gaat" : "gaan"} terug naar de koppelregels: meestal de standaardcode van het kanaal, anders staan ze weer bij Na te kijken. Wat met de hand gezet werd, andere uitleningen en andere kanalen blijven zoals ze zijn.`
                      : `${open.linkedLabel} of ${open.channel}, ${open.daysLabel}, ${open.linkedCount === 1 ? "loses" : "lose"} ${open.code ? `code ${open.code.label}` : "this lending"} and ${open.linkedCount === 1 ? "goes" : "go"} back to the matching rules: usually the channel's default code, otherwise they are back under To review. What was set by hand, other lendings and other channels stay as they are.`
                  }
                  confirmLabel={nl ? "Verwijderen" : "Delete"}
                  cancelLabel={nl ? "Annuleren" : "Cancel"}
                  successMessage={
                    nl
                      ? `Uitlening verwijderd; ${open.linkedLabel} ${open.linkedCount === 1 ? "gaat" : "gaan"} terug naar de koppelregels.`
                      : `Lending deleted; ${open.linkedLabel} ${open.linkedCount === 1 ? "goes" : "go"} back to the matching rules.`
                  }
                  errorMessages={errorMessages}
                  errorFallback={nl ? "Verwijderen mislukt." : "Could not delete."}
                >
                  {nl ? "Uitlening verwijderen" : "Delete lending"}
                </DeleteButton>
              )}
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/**
 * Wat op die dagen met de hand gezet werd. Met dezelfde code kan het in de
 * uitlening opgaan (de dagen van het oude dagformulier); met een andere code
 * koos iemand bewust, en dat blijft.
 */
function TakeOver({
  item,
  locale,
  action,
  errorMessages,
}: {
  item: LendingListItem;
  locale: "nl" | "en";
  action: (formData: FormData) => Promise<SaveState>;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  if (item.manualCount === 0) return null;
  const others = item.manualCount - item.takeOverCount;
  const othersText = nl
    ? `${others} met de hand gezet met een andere code ${others === 1 ? "blijft" : "blijven"} zoals ${others === 1 ? "ze is" : "ze zijn"}: daar koos iemand bewust iets anders.`
    : `${others} set by hand with another code stay as they are: someone chose that on purpose.`;
  if (item.takeOverCount === 0) {
    return (
      <p className="text-sm text-vtk-muted">
        {othersText}{" "}
        <Link href={item.manualHref} className="underline underline-offset-2 hover:text-vtk-navy">
          {nl ? "Bekijk ze in Transacties" : "See them in Transactions"}
        </Link>
      </p>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="text-vtk-muted">
        {nl
          ? `${item.takeOverLabel} op die dagen ${item.takeOverCount === 1 ? "kreeg" : "kregen"} met de hand dezelfde code, wellicht met het oude formulier "Een hele dag van een kanaal anders toewijzen". Neem ze over, dan staan ze bij deze uitlening en gaan ze met haar mee als je ze aanpast of verwijdert.`
          : `${item.takeOverLabel} on those days got the same code by hand, probably with the old form "Assign a whole day of a channel differently". Take them over, and they belong to this lending and follow it.`}
        {others > 0 ? ` ${othersText}` : ""}
      </p>
      <ConfirmTextButton
        className="rounded-full border border-vtk-blue/15 px-3 py-1.5 font-medium text-vtk-navy hover:bg-vtk-blue-soft/60"
        action={action}
        fields={{ id: item.id }}
        title={nl ? "Overnemen in de uitlening?" : "Take over into the lending?"}
        description={
          nl
            ? `${item.takeOverLabel} van ${item.channel} ${item.takeOverCount === 1 ? "gaat" : "gaan"} van "met de hand" naar deze uitlening. De code blijft ${item.code?.label ?? "dezelfde"}, dus geen enkel totaal verandert.${others > 0 ? ` ${othersText}` : ""}`
            : `${item.takeOverLabel} of ${item.channel} ${item.takeOverCount === 1 ? "goes" : "go"} from "by hand" to this lending. The code stays ${item.code?.label ?? "the same"}, so no total changes.${others > 0 ? ` ${othersText}` : ""}`
        }
        confirmLabel={nl ? "Overnemen" : "Take over"}
        destructive={false}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        successMessage={nl ? `${item.takeOverLabel} overgenomen in de uitlening.` : `${item.takeOverLabel} taken over into the lending.`}
        errorMessages={errorMessages}
        errorFallback={nl ? "Overnemen mislukt." : "Could not take over."}
      >
        {nl
          ? `Neem over in deze uitlening (${item.takeOverCount} ${item.takeOverCount === 1 ? "betaling" : "betalingen"})`
          : `Take over into this lending (${item.takeOverCount} ${item.takeOverCount === 1 ? "payment" : "payments"})`}
      </ConfirmTextButton>
    </div>
  );
}
