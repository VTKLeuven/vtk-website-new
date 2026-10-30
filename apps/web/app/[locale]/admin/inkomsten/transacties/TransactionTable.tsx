"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/Link";
import { AccountingCodePicker } from "@/components/admin/AccountingCodePicker";
import { SaveForm } from "@/components/ui/SaveForm";
import { Modal } from "../../admin-table";
import type { AccountingCodeOption } from "@/lib/accounting/codes";
import type { IncomeKindCode } from "@/lib/inkomsten/parse";
import type { IncomeRuleCode } from "@/lib/inkomsten/transactionFilter";
import { formatEuro } from "@/lib/rekeningen/expenses";
import type { SaveAction } from "@/lib/saveState";
import { KIND_LABELS, RULE_LABELS } from "../shared";

/** Eén rij van de lijst, met de teksten al op de server opgemaakt. */
export type TransactionRow = {
  id: string;
  kind: IncomeKindCode;
  when: string;
  /** "oktober 2026": de maand waarin ze telt; null bij Mollie zolang niet uitbetaald. */
  month: string | null;
  source: string;
  channel: string | null;
  description: string | null;
  providerId: string | null;
  reference: string | null;
  payoutReference: string | null;
  notPaidOut: boolean;
  amountCents: number;
  refundedCents: number | null;
  code: string | null;
  codeName: string | null;
  rule: IncomeRuleCode | null;
  excluded: boolean;
  assignedBy: string | null;
  assignedAt: string | null;
  ticketHref: string | null;
  cashRegister: { href: string; label: string } | null;
  /** Hangt aan iets wat de site kent (kassa, ticketverkoop, lidgeld, uitleendienst). */
  linked: boolean;
  locked: boolean;
};

const assignable = (row: TransactionRow) => (row.kind === "PAYMENT" || row.kind === "REFUND") && !row.locked;

/** Klikken op een link, knop of vinkje in een rij opent het detail niet. */
function ownsClick(event: MouseEvent): boolean {
  return Boolean((event.target as HTMLElement).closest("a, button, input, label, [data-row-action]"));
}

/**
 * De lijst van /admin/inkomsten/transacties: een klik op een rij toont het
 * detail met de code, vinkjes kiezen er meer tegelijk. Zoals in het rekenblad:
 * filteren, alles aanvinken, één code geven. Wie meer wil dan deze pagina, kiest
 * "alles wat aan de filter voldoet"; de server telt dan opnieuw en weigert als
 * dat niet meer het aantal is dat de bevestiging noemde.
 */
export function TransactionTable({
  rows,
  codes,
  locale,
  base,
  filterQuery,
  matching,
  action,
  errorMessages,
}: {
  rows: TransactionRow[];
  codes: AccountingCodeOption[];
  locale: "nl" | "en";
  base: string;
  /** De filter van de pagina als query, zonder paginanummer. */
  filterQuery: string;
  /** Hoeveel betalingen en terugbetalingen aan de filter voldoen, over alle pagina's. */
  matching: number;
  action: SaveAction;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const headerBox = useRef<HTMLInputElement>(null);

  const selectable = rows.filter(assignable);
  const pageSelected = selectable.filter((row) => selected.has(row.id));
  const everyOnPage = selectable.length > 0 && pageSelected.length === selectable.length;
  const someOnPage = pageSelected.length > 0 && !everyOnPage;
  const chosen = allMatching ? matching : pageSelected.length;
  const chosenCents = pageSelected.reduce((sum, row) => sum + row.amountCents, 0);
  const openRow = rows.find((row) => row.id === openId) ?? null;

  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = someOnPage && !allMatching;
  }, [someOnPage, allMatching]);

  function toggle(id: string) {
    setAllMatching(false);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setAllMatching(false);
    setSelected(everyOnPage ? new Set() : new Set(selectable.map((row) => row.id)));
  }

  function clear() {
    setAllMatching(false);
    setSelected(new Set());
  }

  const count = (n: number) =>
    nl ? `${n.toLocaleString("nl-BE")} ${n === 1 ? "transactie" : "transacties"}` : `${n.toLocaleString("en-GB")} ${n === 1 ? "transaction" : "transactions"}`;

  return (
    <>
      <div className="relative mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-vtk-blue/12 text-left text-xs uppercase tracking-wide text-vtk-muted">
              <th className="w-8 py-2 pl-3">
                <input
                  ref={headerBox}
                  type="checkbox"
                  className="h-4 w-4 align-middle"
                  checked={allMatching || everyOnPage}
                  disabled={selectable.length === 0}
                  onChange={toggleAll}
                  aria-label={nl ? "Alles op deze pagina aanvinken" : "Tick everything on this page"}
                />
              </th>
              <th className="px-3 py-2">{nl ? "Wanneer" : "When"}</th>
              <th className="px-3 py-2">{nl ? "Kanaal" : "Channel"}</th>
              <th className="px-3 py-2">{nl ? "Omschrijving" : "Description"}</th>
              <th className="px-3 py-2 text-right">{nl ? "Bedrag" : "Amount"}</th>
              <th className="px-3 py-2">{nl ? "Code" : "Code"}</th>
              <th className="px-3 py-2">{nl ? "Waarom" : "Why"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rule = row.rule ? RULE_LABELS[row.rule] : null;
              const isSelected = allMatching ? assignable(row) : selected.has(row.id);
              return (
                <tr
                  key={row.id}
                  onClick={(event) => {
                    if (!ownsClick(event)) setOpenId(row.id);
                  }}
                  className={`cursor-pointer border-b border-vtk-blue/8 align-top last:border-0 hover:bg-vtk-blue-soft/40 ${isSelected ? "bg-vtk-blue-soft/60" : ""}`}
                >
                  <td className="py-2 pl-3" data-row-action>
                    {assignable(row) ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 align-middle"
                        checked={isSelected}
                        onChange={() => toggle(row.id)}
                        aria-label={nl ? `Aanvinken: ${row.description ?? row.when}` : `Tick: ${row.description ?? row.when}`}
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {row.when}
                    {row.notPaidOut ? (
                      <span className="block text-xs text-vtk-muted">{nl ? "nog niet uitbetaald" : "not paid out yet"}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {row.source}
                    {row.channel ? <span className="block text-xs text-vtk-muted">{row.channel}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    {row.kind !== "PAYMENT" ? (
                      <span className="mr-1 text-xs font-medium uppercase text-vtk-muted">{nl ? KIND_LABELS[row.kind].nl : KIND_LABELS[row.kind].en}</span>
                    ) : null}
                    {/* De echte knop voor wie met het toetsenbord of een screenreader werkt; de rij zelf klikt ook. */}
                    <button type="button" onClick={() => setOpenId(row.id)} className="text-left hover:underline">
                      {row.description || (nl ? "(zonder omschrijving)" : "(no description)")}
                    </button>
                    {row.providerId ? <span className="block text-xs break-all text-vtk-muted">{row.providerId}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {formatEuro(row.amountCents, locale)}
                    {row.refundedCents ? (
                      <span className="block text-xs text-vtk-muted">
                        {nl ? "teruggestort " : "refunded "}
                        {formatEuro(row.refundedCents, locale)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {row.excluded ? (
                      <span className="text-vtk-muted">{nl ? "telt niet mee" : "does not count"}</span>
                    ) : row.code ? (
                      <>
                        <span className="tabular-nums">{row.code}</span>
                        <span className="block text-xs text-vtk-muted">{row.codeName}</span>
                      </>
                    ) : row.kind === "PAYMENT" || row.kind === "REFUND" ? (
                      <span className="text-vtk-warn">{nl ? "na te kijken" : "to review"}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {rule ? (nl ? rule.nl : rule.en) : ""}
                    {row.rule === "MANUAL" && row.assignedBy ? <span className="block text-xs text-vtk-muted">{row.assignedBy}</span> : null}
                    {row.locked ? <span className="block text-xs text-vtk-muted">{nl ? "afgesloten maand" : "closed month"}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {chosen > 0 ? (
        <div className="sticky bottom-3 z-10 mt-4 rounded-2xl border border-vtk-blue/15 bg-white p-4 shadow-lg">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
            <p>
              <span className="font-medium">
                {allMatching
                  ? nl
                    ? `Alle ${count(chosen)} die aan de filter voldoen`
                    : `All ${count(chosen)} matching the filter`
                  : nl
                    ? `${count(chosen)} aangevinkt, samen ${formatEuro(chosenCents, locale)}`
                    : `${count(chosen)} ticked, together ${formatEuro(chosenCents, locale)}`}
              </span>
              {/* In de balk en niet onder de tabel: die balk plakt onderaan en zou de keuze bedekken. */}
              {everyOnPage && !allMatching && matching > pageSelected.length ? (
                <button type="button" onClick={() => setAllMatching(true)} className="ml-3 text-vtk-navy underline">
                  {nl ? `Kies alle ${count(matching)} die aan de filter voldoen` : `Choose all ${count(matching)} matching the filter`}
                </button>
              ) : allMatching ? (
                <button type="button" onClick={() => setAllMatching(false)} className="ml-3 text-vtk-navy underline">
                  {nl ? "Enkel deze pagina" : "Only this page"}
                </button>
              ) : null}
            </p>
            <button type="button" onClick={clear} className="text-vtk-muted underline">
              {nl ? "Niets meer aanvinken" : "Untick all"}
            </button>
          </div>
          <BulkForm
            ids={allMatching ? null : pageSelected.map((row) => row.id)}
            filterQuery={filterQuery}
            matching={matching}
            chosen={chosen}
            codes={codes}
            locale={locale}
            action={action}
            errorMessages={errorMessages}
            onDone={() => {
              clear();
              router.refresh();
            }}
          />
        </div>
      ) : null}

      {openRow ? (
        <TransactionDetail
          row={openRow}
          codes={codes}
          locale={locale}
          base={base}
          action={action}
          errorMessages={errorMessages}
          onClose={() => setOpenId(null)}
          onDone={() => {
            setOpenId(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

/** De keuze voor de aangevinkte rijen, of voor alles wat aan de filter voldoet. */
function BulkForm({
  ids,
  filterQuery,
  matching,
  chosen,
  codes,
  locale,
  action,
  errorMessages,
  onDone,
}: {
  ids: string[] | null;
  filterQuery: string;
  matching: number;
  chosen: number;
  codes: AccountingCodeOption[];
  locale: "nl" | "en";
  action: SaveAction;
  errorMessages: Record<string, string>;
  onDone: () => void;
}) {
  const nl = locale === "nl";
  // Zonder code geen bevestiging: die zou vragen en dan toch weigeren. Zo zegt
  // de foutmelding meteen dat er een code moet zijn. `submitDisabled` kan niet,
  // dat zet ook Telt niet mee en Terug naar de regels uit.
  const [hasCode, setHasCode] = useState(false);
  const n = chosen.toLocaleString(nl ? "nl-BE" : "en-GB");
  const what = nl ? `${n} ${chosen === 1 ? "transactie" : "transacties"}` : `${n} ${chosen === 1 ? "transaction" : "transactions"}`;
  const cancelLabel = nl ? "Annuleren" : "Cancel";
  const stays = nl
    ? "Een afgesloten maand blijft zoals ze is. Terug naar de regels draait het later terug."
    : "A closed month stays as it is. Back to the rules undoes it later.";
  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Toewijzen" : "Assign"}
      submitSize="sm"
      savingLabel={nl ? "Bezig..." : "Saving..."}
      savedMessage={nl ? "Toegewezen." : "Assigned."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Toewijzen mislukt." : "Could not assign."}
      confirmSubmit={
        hasCode
          ? {
              title: nl ? `${what} met de hand een code geven?` : `Give ${what} a code by hand?`,
              description: nl
                ? `Ze krijgen de gekozen code, wat de koppelregels ook zeiden, en de regels raken ze daarna niet meer aan. Een betaling die aan een kassa of een verkoop op de site hing, verliest die koppeling. ${stays}`
                : `They get the chosen code, whatever the matching rules said, and the rules leave them alone from then on. A payment linked to a cash register or a sale on the site loses that link. ${stays}`,
              confirmLabel: nl ? "Toewijzen" : "Assign",
              cancelLabel,
            }
          : null
      }
      secondarySubmit={[
        {
          name: "intent",
          value: "exclude",
          label: nl ? "Telt niet mee" : "Does not count",
          confirm: {
            title: nl ? `${what} laten wegvallen?` : `Leave out ${what}?`,
            description: nl
              ? `Ze tellen niet meer mee in het overzicht en in het blad voor de boekhouder; ze blijven wel in deze lijst staan, onder Telt niet mee. ${stays}`
              : `They no longer count in the overview and the accountant's sheet; they stay in this list, under Does not count. ${stays}`,
            confirmLabel: nl ? "Laten wegvallen" : "Leave out",
            cancelLabel,
          },
        },
        {
          name: "intent",
          value: "reset",
          label: nl ? "Terug naar de regels" : "Back to the rules",
          confirm: {
            title: nl ? `${what} terug aan de koppelregels geven?` : `Give ${what} back to the matching rules?`,
            description: nl
              ? "Wat er met de hand een code kreeg of wegviel, verliest die keuze; de koppelregels nemen het weer over, en wat geen regel plaatst, staat opnieuw bij Na te kijken. Wat al een regel volgde, verandert niet."
              : "What got a code or was left out by hand loses that choice; the matching rules take over again, and what no rule places is back under To review. What already followed a rule does not change.",
            confirmLabel: nl ? "Terugzetten" : "Reset",
            cancelLabel,
          },
        },
      ]}
      resetOnSuccess={false}
      onSuccess={onDone}
      className="flex flex-wrap items-end gap-3"
    >
      {ids ? (
        ids.map((id) => <input key={id} type="hidden" name="id" value={id} />)
      ) : (
        <>
          <input type="hidden" name="scope" value="filter" />
          <input type="hidden" name="filter" value={filterQuery} />
          <input type="hidden" name="expected" value={matching} />
        </>
      )}
      <div className="min-w-[16rem] flex-1">
        <AccountingCodePicker codes={codes} name="accountingCodeId" locale={locale} onChange={(id) => setHasCode(id !== "")} />
      </div>
    </SaveForm>
  );
}

/** Het detail van één transactie, met de code zoals ze nu staat en de keuze om ze te veranderen. */
function TransactionDetail({
  row,
  codes,
  locale,
  base,
  action,
  errorMessages,
  onClose,
  onDone,
}: {
  row: TransactionRow;
  codes: AccountingCodeOption[];
  locale: "nl" | "en";
  base: string;
  action: SaveAction;
  errorMessages: Record<string, string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const nl = locale === "nl";
  const rule = row.rule ? RULE_LABELS[row.rule] : null;
  const codeId = row.code ? (codes.find((code) => code.code === row.code)?.id ?? null) : null;
  const fact = (label: string, value: ReactNode) =>
    value ? (
      <>
        <dt className="text-vtk-muted">{label}</dt>
        <dd className="break-words">{value}</dd>
      </>
    ) : null;

  return (
    <Modal title={row.description || (nl ? "Transactie" : "Transaction")} onClose={onClose}>
      <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
        {fact(nl ? "Wanneer" : "When", row.when)}
        {fact(nl ? "Bron" : "Source", row.channel ? `${row.source}, ${row.channel}` : row.source)}
        {fact(nl ? "Soort" : "Kind", nl ? KIND_LABELS[row.kind].nl : KIND_LABELS[row.kind].en)}
        {fact(
          nl ? "Bedrag" : "Amount",
          <span className="tabular-nums">
            {formatEuro(row.amountCents, locale)}
            {row.refundedCents ? ` (${nl ? "teruggestort" : "refunded"} ${formatEuro(row.refundedCents, locale)})` : ""}
          </span>,
        )}
        {fact(nl ? "Telt in" : "Counts in", row.month ?? (nl ? "nog niet uitbetaald" : "not paid out yet"))}
        {fact(nl ? "Uitbetaling" : "Payout", row.payoutReference)}
        {fact(nl ? "ID" : "ID", row.providerId)}
        {fact(nl ? "Referentie" : "Reference", row.reference)}
        {fact(
          nl ? "Code" : "Code",
          row.excluded ? (nl ? "telt niet mee" : "does not count") : row.code ? `${row.code} ${row.codeName ?? ""}` : row.kind === "PAYMENT" || row.kind === "REFUND" ? (nl ? "na te kijken" : "to review") : "",
        )}
        {fact(
          nl ? "Waarom" : "Why",
          rule
            ? `${nl ? rule.nl : rule.en}${row.rule === "MANUAL" && row.assignedBy ? `, ${row.assignedBy}` : ""}${row.rule === "MANUAL" && row.assignedAt ? ` (${row.assignedAt})` : ""}`
            : null,
        )}
        {fact(
          nl ? "Gekoppeld aan" : "Linked to",
          row.ticketHref || row.cashRegister ? (
            <>
              {row.ticketHref ? (
                <Link href={row.ticketHref} className="block text-vtk-navy underline">
                  {nl ? "Ticketverkoop" : "Ticket sale"}
                </Link>
              ) : null}
              {row.cashRegister ? (
                <Link href={row.cashRegister.href} className="block text-vtk-navy underline">
                  {row.cashRegister.label}
                </Link>
              ) : null}
            </>
          ) : null,
        )}
      </dl>

      <div className="mt-5 border-t border-vtk-blue/10 pt-4">
        {row.locked ? (
          <p className="text-sm text-vtk-muted">
            {nl
              ? "Deze maand is afgesloten en verandert niet meer. Heropen de periode bij Instellingen om iets te veranderen."
              : "This month is closed and no longer changes. Reopen the period under Settings to change something."}
          </p>
        ) : row.kind === "FEE" || row.kind === "RESERVE" ? (
          <p className="text-sm text-vtk-muted">
            {nl
              ? "Kosten en reserve krijgen geen eigen code: ze staan op hun eigen regel in het overzicht, de kosten met de kostencode uit Instellingen."
              : "Fees and reserve get no code of their own: they have their own line in the overview, the fees with the fee code from Settings."}
          </p>
        ) : (
          <>
            {row.rule === "NAME_RULE" ? (
              <p className="mb-3 text-sm text-vtk-muted">
                {nl ? "Deze code komt van een onthouden tekst. Is die zelf fout, pas ze dan aan bij " : "This code comes from a remembered text. If that is wrong itself, change it under "}
                <Link href={`${base}/admin/inkomsten/instellingen`} className="underline">
                  {nl ? "Instellingen" : "Settings"}
                </Link>
                {nl ? ": dan volgt elke betaling met die tekst." : ": then every payment with that text follows."}
              </p>
            ) : null}
            {row.linked ? (
              <p className="mb-3 text-sm text-vtk-muted">
                {nl
                  ? "Met de hand een code geven maakt de koppeling hierboven los. Terug naar de regels legt ze opnieuw."
                  : "Giving a code by hand removes the link above. Back to the rules puts it back."}
              </p>
            ) : null}
            <SaveForm
              action={action}
              submitLabel={nl ? "Toewijzen" : "Assign"}
              submitSize="sm"
              savingLabel={nl ? "Bezig..." : "Saving..."}
              savedMessage={nl ? "Toegewezen." : "Assigned."}
              errorMessages={errorMessages}
              fallbackErrorMessage={nl ? "Toewijzen mislukt." : "Could not assign."}
              secondarySubmit={[
                ...(row.excluded ? [] : [{ name: "intent", value: "exclude", label: nl ? "Telt niet mee" : "Does not count" }]),
                ...(row.rule === "MANUAL"
                  ? [
                      {
                        name: "intent",
                        value: "reset",
                        label: nl ? "Terug naar de regels" : "Back to the rules",
                        confirm: {
                          title: nl ? "De keuze met de hand wissen?" : "Clear the choice made by hand?",
                          description: nl
                            ? "De koppelregels nemen deze transactie weer over. Past er geen, dan staat ze opnieuw bij Na te kijken. Andere transacties houden hun code."
                            : "The matching rules take this transaction over again. If none fits, it is back under To review. Other transactions keep their code.",
                          confirmLabel: nl ? "Wissen" : "Clear",
                          cancelLabel: nl ? "Annuleren" : "Cancel",
                        },
                      },
                    ]
                  : []),
              ]}
              resetOnSuccess={false}
              onSuccess={onDone}
              className="space-y-3"
            >
              <input type="hidden" name="id" value={row.id} />
              <AccountingCodePicker codes={codes} name="accountingCodeId" defaultValue={codeId} locale={locale} />
            </SaveForm>
          </>
        )}
      </div>
    </Modal>
  );
}
