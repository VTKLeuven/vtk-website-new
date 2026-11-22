"use client";

import { useState, type MouseEvent } from "react";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import type { AccountingCodeOption } from "@/lib/accounting/codes";
import type { SaveAction, SaveState } from "@/lib/saveState";
import { Modal } from "../../admin-table";
import { TransferForm, type TransferDefaults } from "./TransferForm";

/** Een overschrijving zoals de lijst ze toont; de teksten maakt de server, zodat ze niet verspringen. */
export type TransferListItem = TransferDefaults & {
  /** "di 16 sep 2026" */
  dayLabel: string;
  /** "€ 12,50" */
  amountLabel: string;
  /** "Galabal opbrengsten (700100 10003)", of null zonder code. */
  codeLabel: string | null;
  /** "Jan Peeters, 21 nov" */
  enteredBy: string;
  excluded: boolean;
  locked: boolean;
};

/** Klikken op een link of knop in een rij opent de overschrijving niet. */
function ownsClick(event: MouseEvent): boolean {
  return Boolean((event.target as HTMLElement).closest("a, button, input, label, [data-row-action]"));
}

export function TransferList({
  items,
  accounts,
  codes,
  locale,
  saveAction,
  deleteAction,
  errorMessages,
}: {
  items: TransferListItem[];
  accounts: string[];
  codes: AccountingCodeOption[];
  locale: "nl" | "en";
  saveAction: SaveAction;
  deleteAction: (formData: FormData) => Promise<SaveState>;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const [openId, setOpenId] = useState<string | null>(null);
  // Na verwijderen staat ze niet meer in de lijst: dan sluit de modal vanzelf.
  const open = items.find((item) => item.id === openId) ?? null;

  return (
    <>
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-vtk-blue/12 text-left text-xs uppercase tracking-wide text-vtk-muted">
              <th className="py-2 pr-3">{nl ? "Dag" : "Day"}</th>
              <th className="px-3 py-2 text-right">{nl ? "Bedrag" : "Amount"}</th>
              <th className="px-3 py-2">{nl ? "Rekening" : "Account"}</th>
              <th className="px-3 py-2">{nl ? "Code" : "Code"}</th>
              <th className="px-3 py-2">{nl ? "Omschrijving" : "Description"}</th>
              <th className="px-3 py-2">{nl ? "Ingevoerd door" : "Entered by"}</th>
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
                <td className="py-2 pr-3 whitespace-nowrap">
                  {/* De echte knop voor wie met het toetsenbord of een screenreader werkt; de rij zelf klikt ook. */}
                  <button
                    type="button"
                    onClick={() => setOpenId(item.id)}
                    className="text-left hover:underline"
                    aria-label={nl ? `Aanpassen: ${item.amountLabel} op ${item.dayLabel}` : `Edit: ${item.amountLabel} on ${item.dayLabel}`}
                  >
                    {item.dayLabel}
                  </button>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {item.amountLabel}
                  {item.excluded ? <span className="block text-xs text-vtk-muted">{nl ? "telt niet mee" : "does not count"}</span> : null}
                </td>
                <td className="px-3 py-2">{item.bankAccount}</td>
                <td className="px-3 py-2">{item.codeLabel ?? <span className="text-vtk-muted">{nl ? "geen code" : "no code"}</span>}</td>
                <td className="px-3 py-2">{item.description}</td>
                <td className="px-3 py-2 text-vtk-muted">{item.enteredBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <Modal title={nl ? "Overschrijving aanpassen" : "Edit transfer"} onClose={() => setOpenId(null)} size="lg">
          {open.locked ? (
            <p className="text-sm text-vtk-muted">
              {nl
                ? "Ze valt in een afgesloten periode: aanpassen en verwijderen kan pas wanneer die heropend is (Instellingen)."
                : "It falls in a closed period: editing and deleting are only possible once that is reopened (Settings)."}
            </p>
          ) : (
            <div className="space-y-5">
              <TransferForm
                key={open.id}
                accounts={accounts}
                codes={codes}
                locale={locale}
                action={saveAction}
                errorMessages={errorMessages}
                transfer={open}
                onSaved={() => setOpenId(null)}
              />
              <div className="border-t border-vtk-blue/10 pt-4">
                <DeleteButton
                  action={deleteAction}
                  fields={{ id: open.id }}
                  title={nl ? "Deze overschrijving verwijderen?" : "Delete this transfer?"}
                  description={
                    nl
                      ? `${open.amountLabel} op ${open.bankAccount}, ${open.dayLabel}, verdwijnt uit het overzicht van die maand en uit het kwartaalblad${open.codeLabel ? ` (${open.codeLabel})` : ""}. Andere overschrijvingen blijven zoals ze zijn.`
                      : `${open.amountLabel} on ${open.bankAccount}, ${open.dayLabel}, disappears from that month's overview and from the quarter sheet${open.codeLabel ? ` (${open.codeLabel})` : ""}. Other transfers stay as they are.`
                  }
                  confirmLabel={nl ? "Verwijderen" : "Delete"}
                  cancelLabel={nl ? "Annuleren" : "Cancel"}
                  successMessage={nl ? `Overschrijving van ${open.amountLabel} verwijderd.` : `Transfer of ${open.amountLabel} deleted.`}
                  errorMessages={errorMessages}
                  errorFallback={nl ? "Verwijderen mislukt." : "Could not delete."}
                >
                  {nl ? "Overschrijving verwijderen" : "Delete transfer"}
                </DeleteButton>
              </div>
            </div>
          )}
        </Modal>
      ) : null}
    </>
  );
}
