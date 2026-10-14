"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button, Input, Label, Select, Textarea } from "@vtk/ui";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import { formatEuro } from "@/lib/rekeningen/expenses";
import {
  amountInputValue,
  computeResult,
  parseAmountInput,
  parseCountInput,
  type Counts,
  type PaymentMethod,
} from "@/lib/kassas/kassa";
import { countInputsFrom, DenominationGrid, inputsFilled, type CountInputs } from "./DenominationGrid";

export type TicketOption = {
  id: string;
  title: string;
  dateLabel: string;
  /** Van dezelfde post als de kassa: die staan bovenaan de keuzelijst. */
  samePost: boolean;
  incomeCents: number;
};

type Line = { key: string; method: PaymentMethod; terminal: string; amount: string };

const METHOD_LABEL: Record<PaymentMethod, string> = { BANCONTACT: "Bancontact", PAYCONIQ: "Payconiq" };

/**
 * De telling na het evenement, met het resultaat dat meerekent terwijl je typt:
 * het rekenblad deed dat ook, en zo zie je een tikfout in de eindkassa meteen
 * aan een vreemd resultaat.
 */
export function CountForm({
  locale,
  action,
  id,
  startCounts,
  endCounts,
  shiftVouchers,
  elixirVouchers,
  shiftVoucherValueCents,
  elixirVoucherValueCents,
  payments,
  wantsBancontact,
  wantsPayconiq,
  bancontactTerminals,
  payconiqAccounts,
  ticketOptions,
  linkedTicketIds,
  note,
  errorMessages,
}: {
  locale: "nl" | "en";
  action: SaveAction;
  id: string;
  startCounts: Counts;
  endCounts: Counts | null;
  shiftVouchers: number | null;
  elixirVouchers: number | null;
  shiftVoucherValueCents: number;
  elixirVoucherValueCents: number;
  payments: Array<{ method: PaymentMethod; terminal: string; amountCents: number | null }>;
  wantsBancontact: boolean;
  wantsPayconiq: boolean;
  bancontactTerminals: string[];
  payconiqAccounts: string[];
  ticketOptions: TicketOption[];
  linkedTicketIds: string[];
  note: string;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const uid = useId();
  const euro = (cents: number) => formatEuro(cents, locale);

  const [end, setEnd] = useState<CountInputs>(() => countInputsFrom(endCounts));
  const [shift, setShift] = useState(shiftVouchers === null ? "" : String(shiftVouchers));
  const [elixir, setElixir] = useState(elixirVouchers === null ? "" : String(elixirVouchers));
  const [lines, setLines] = useState<Line[]>(() => {
    const saved = payments.map((payment, index) => ({
      key: `saved-${index}`,
      method: payment.method,
      terminal: payment.terminal,
      amount: amountInputValue(payment.amountCents),
    }));
    if (saved.length > 0) return saved;
    // Nog niets gekozen: zet al een lege regel klaar voor wat de post vroeg.
    return [
      ...(wantsBancontact ? [{ key: "new-bc", method: "BANCONTACT" as const, terminal: "", amount: "" }] : []),
      ...(wantsPayconiq ? [{ key: "new-pq", method: "PAYCONIQ" as const, terminal: "", amount: "" }] : []),
    ];
  });
  const [ticketIds, setTicketIds] = useState<string[]>(linkedTicketIds);
  const [nextKey, setNextKey] = useState(0);

  const optionById = new Map(ticketOptions.map((option) => [option.id, option]));
  const counted = inputsFilled(end);
  const endForResult = counted
    ? (Object.fromEntries(
        Object.entries(end).map(([key, value]) => [key, parseCountInput(value) ?? 0]),
      ) as Counts)
    : null;
  const count = (value: string) => {
    const parsed = parseCountInput(value);
    return typeof parsed === "number" ? parsed : null;
  };
  const result = computeResult({
    startCounts,
    endCounts: endForResult,
    shiftVouchers: count(shift),
    elixirVouchers: count(elixir),
    shiftVoucherValueCents,
    elixirVoucherValueCents,
    payments: lines.map((line) => ({
      method: line.method,
      amountCents: parseAmountInput(line.amount) ?? null,
    })),
    ticketIncomeCents: ticketIds.map((ticketId) => optionById.get(ticketId)?.incomeCents ?? 0),
  });

  function addLine(method: PaymentMethod) {
    setLines((current) => [...current, { key: `added-${nextKey}`, method, terminal: "", amount: "" }]);
    setNextKey((key) => key + 1);
  }
  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function paymentSection(method: PaymentMethod, names: string[]) {
    const methodLines = lines.filter((line) => line.method === method);
    const label = METHOD_LABEL[method];
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-vtk-ink">
          {method === "BANCONTACT" ? (nl ? "Bancontact-bakjes" : "Bancontact terminals") : nl ? "Payconiq-rekeningen" : "Payconiq accounts"}
        </h3>
        {methodLines.length === 0 && (
          <p className="text-sm text-vtk-muted">{nl ? "Geen (n.v.t.)." : "None (n/a)."}</p>
        )}
        {methodLines.map((line, index) => {
          // Een bakje dat intussen hernoemd of geschrapt is, blijft kiesbaar op
          // de kassa waar het al op stond.
          const options = line.terminal && !names.includes(line.terminal) ? [line.terminal, ...names] : names;
          const selectId = `${uid}-${line.key}-terminal`;
          const amountId = `${uid}-${line.key}-amount`;
          return (
            <div key={line.key} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="paymentMethod" value={method} />
              <div className="w-52">
                <Label htmlFor={selectId} className={index > 0 ? "sr-only" : undefined}>
                  {method === "BANCONTACT" ? (nl ? "Bakje" : "Terminal") : nl ? "Rekening" : "Account"}
                </Label>
                <Select
                  id={selectId}
                  name="paymentTerminal"
                  value={line.terminal}
                  onChange={(event) => updateLine(line.key, { terminal: event.target.value })}
                >
                  <option value="">{nl ? "Kies..." : "Choose..."}</option>
                  {options.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-36">
                <Label htmlFor={amountId} className={index > 0 ? "sr-only" : undefined}>
                  {nl ? "Bedrag" : "Amount"}
                </Label>
                <Input
                  id={amountId}
                  name="paymentAmount"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={nl ? "nog niet afgelezen" : "not read yet"}
                  value={line.amount}
                  onChange={(event) => updateLine(line.key, { amount: event.target.value })}
                  aria-invalid={parseAmountInput(line.amount) === undefined || undefined}
                  className="text-right tabular-nums"
                />
              </div>
              <IconButton
                label={nl ? "Regel weghalen" : "Remove line"}
                srLabel={`${nl ? "Regel weghalen" : "Remove line"}: ${label} ${line.terminal}`}
                tone="danger"
                className="mb-1"
                onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))}
              >
                <TrashIcon />
              </IconButton>
            </div>
          );
        })}
        <Button type="button" variant="ghost" size="sm" onClick={() => addLine(method)}>
          {method === "BANCONTACT"
            ? nl
              ? "Bakje toevoegen"
              : "Add terminal"
            : nl
              ? "Rekening toevoegen"
              : "Add account"}
        </Button>
      </section>
    );
  }

  const available = ticketOptions.filter((option) => !ticketIds.includes(option.id));
  const samePost = available.filter((option) => option.samePost);
  const otherPosts = available.filter((option) => !option.samePost);

  // Twee groepen, elk in een eigen kolom: de kassa zelf (begin, eind, verschil)
  // en wat er verder binnenkwam. In één raster van twee kolommen las je ze
  // kriskras door elkaar.
  const resultGroups: Array<Array<{ label: string; value: string; strong?: boolean }>> = [
    [
      { label: nl ? "Beginkassa" : "Starting float", value: euro(result.startCents) },
      {
        label: nl ? "Eindkassa" : "Closing count",
        value: result.endCents === null ? (nl ? "nog niet geteld" : "not counted yet") : euro(result.endCents),
      },
      {
        label: nl ? "Resultaat kassa" : "Cash result",
        value: result.cashCents === null ? (nl ? "nog niet geteld" : "not counted yet") : euro(result.cashCents),
        strong: true,
      },
    ],
    [
      { label: "Bancontact", value: euro(result.bancontactCents) },
      { label: "Payconiq", value: euro(result.payconiqCents) },
      { label: nl ? "Ticketverkoop" : "Ticket sales", value: euro(result.ticketCents) },
      { label: nl ? "Bonnen" : "Vouchers", value: euro(result.voucherCents) },
    ],
  ];

  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Telling opslaan" : "Save count"}
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={nl ? "Telling opgeslagen." : "Count saved."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Opslaan mislukt." : "Could not save."}
      resetOnSuccess={false}
      onSuccess={() => router.refresh()}
      className="space-y-6"
    >
      <input type="hidden" name="id" value={id} />

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-vtk-ink">{nl ? "Eindkassa" : "Closing count"}</h3>
          <span className="text-sm text-vtk-body">
            {nl ? "Totaal" : "Total"}{" "}
            <strong className="tabular-nums text-vtk-ink">
              {result.endCents === null ? (nl ? "nog niet geteld" : "not counted yet") : euro(result.endCents)}
            </strong>
          </span>
        </div>
        <p className="mb-3 mt-1 text-xs text-vtk-muted">
          {nl
            ? "Tel wat er na de activiteit in de kassa zit. Zolang alles leeg is, staat de kassa als niet geteld; vul 0 in voor een coupure die er niet in zit."
            : "Count what is in the register after the activity. While everything is empty, the register counts as not counted; enter 0 for a denomination that is not in it."}
        </p>
        <DenominationGrid
          locale={locale}
          prefix="end_"
          idPrefix={`${uid}-end`}
          values={end}
          onChange={setEnd}
          compare={startCounts}
          compareLabel={nl ? "begin" : "start"}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${uid}-shift`}>{nl ? "Shiftersbonnen" : "Shift vouchers"}</Label>
          <Input
            id={`${uid}-shift`}
            name="shiftVouchers"
            inputMode="numeric"
            autoComplete="off"
            value={shift}
            onChange={(event) => setShift(event.target.value)}
            className="tabular-nums"
          />
          <p className="mt-1 text-xs text-vtk-muted">
            {nl ? "Telt mee aan" : "Counts at"} {euro(shiftVoucherValueCents)} {nl ? "per bon." : "per voucher."}
          </p>
        </div>
        <div>
          <Label htmlFor={`${uid}-elixir`}>{nl ? "Elixirbonnen" : "Elixir vouchers"}</Label>
          <Input
            id={`${uid}-elixir`}
            name="elixirVouchers"
            inputMode="numeric"
            autoComplete="off"
            value={elixir}
            onChange={(event) => setElixir(event.target.value)}
            className="tabular-nums"
          />
          <p className="mt-1 text-xs text-vtk-muted">
            {nl ? "Telt mee aan" : "Counts at"} {euro(elixirVoucherValueCents)} {nl ? "per bon." : "per voucher."}
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {paymentSection("BANCONTACT", bancontactTerminals)}
        {paymentSection("PAYCONIQ", payconiqAccounts)}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-vtk-ink">{nl ? "Online ticketverkoop" : "Online ticket sales"}</h3>
        <p className="text-xs text-vtk-muted">
          {nl
            ? "Koppel de ticketverkoop van deze activiteit; de netto verkoop (min terugbetalingen) telt mee in het resultaat en volgt de verkoop zolang ze loopt."
            : "Link this activity's ticket sale; the net sales (minus refunds) count in the result and follow the sale while it runs."}
        </p>
        {ticketIds.length > 0 && (
          <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/12 bg-white">
            {ticketIds.map((ticketId) => {
              const option = optionById.get(ticketId);
              return (
                <li key={ticketId} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <input type="hidden" name="ticketEventId" value={ticketId} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-vtk-ink">{option?.title ?? ticketId}</span>
                    {option && <span className="block text-xs text-vtk-muted">{option.dateLabel}</span>}
                  </span>
                  <span className="tabular-nums text-vtk-ink">{euro(option?.incomeCents ?? 0)}</span>
                  <IconButton
                    label={nl ? "Ontkoppelen" : "Unlink"}
                    srLabel={`${nl ? "Ontkoppelen" : "Unlink"}: ${option?.title ?? ticketId}`}
                    onClick={() => setTicketIds((current) => current.filter((candidate) => candidate !== ticketId))}
                  >
                    <TrashIcon />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
        {available.length > 0 && (
          <div className="w-full max-w-md">
            <Label htmlFor={`${uid}-ticket`} className="sr-only">
              {nl ? "Ticketverkoop koppelen" : "Link a ticket sale"}
            </Label>
            <Select
              id={`${uid}-ticket`}
              value=""
              onChange={(event) => {
                const value = event.target.value;
                if (value) setTicketIds((current) => [...current, value]);
              }}
            >
              <option value="">{nl ? "Ticketverkoop koppelen..." : "Link a ticket sale..."}</option>
              {samePost.length > 0 && (
                <optgroup label={nl ? "Van deze post" : "From this post"}>
                  {samePost.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title} ({option.dateLabel})
                    </option>
                  ))}
                </optgroup>
              )}
              {otherPosts.length > 0 && (
                <optgroup label={nl ? "Andere ticketverkopen" : "Other ticket sales"}>
                  {otherPosts.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title} ({option.dateLabel})
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </div>
        )}
      </section>

      <div>
        <Label htmlFor={`${uid}-note`}>{nl ? "Opmerking van Beheer" : "Administration note"}</Label>
        <Textarea
          id={`${uid}-note`}
          name="note"
          rows={2}
          maxLength={2000}
          defaultValue={note}
          placeholder={nl ? "Enkel zichtbaar voor wie kassa's beheert." : "Only visible to cash register managers."}
        />
      </div>

      <section
        aria-label={nl ? "Resultaat" : "Result"}
        className="rounded-2xl border border-vtk-blue/12 bg-white p-4 shadow-[inset_3px_0_0_var(--yellow)]"
      >
        <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {resultGroups.map((group, index) => (
            <dl key={index} className="space-y-1">
              {group.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3">
                  <dt className={row.strong ? "font-medium text-vtk-ink" : "text-vtk-muted"}>{row.label}</dt>
                  <dd className={`tabular-nums text-vtk-ink ${row.strong ? "font-semibold" : ""}`}>{row.value}</dd>
                </div>
              ))}
            </dl>
          ))}
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-vtk-blue/10 pt-3">
          <span className="text-sm font-semibold text-vtk-ink">{nl ? "Finaal resultaat" : "Final result"}</span>
          <span className="text-xl font-semibold tabular-nums text-vtk-ink">{euro(result.totalCents)}</span>
        </div>
      </section>
    </SaveForm>
  );
}
