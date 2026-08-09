"use client";

import { Input } from "@vtk/ui";
import { formatEuroCents } from "@/lib/fakbar";
import {
  BILL_DENOMINATIONS,
  COIN_DENOMINATIONS,
  cashCountTotalCents,
  type CashCount,
} from "@/lib/fakbar-cash";

/**
 * Telraster voor munten en biljetten: per denominatie het aantal stuks, met de
 * waarde per rij en het totaal eronder dat live meetelt.
 *
 * Er staat bewust een veld voor élke denominatie klaar in plaats van een
 * "voeg toe"-knop: tellen gaat vlotter als het raster de lade volgt.
 */
export function CashCountGrid({
  prefix,
  nl,
  count,
  onChange,
  label,
}: {
  /** Veldnamen worden `<prefix>-<denominatie in cent>`. */
  prefix: string;
  nl: boolean;
  count: CashCount;
  onChange: (count: CashCount) => void;
  label: string;
}) {
  const total = cashCountTotalCents(count);

  const group = (title: string, denominations: typeof COIN_DENOMINATIONS) => (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#5c667f]">{title}</p>
      {denominations.map((d) => {
        const quantity = count[d.cents] ?? 0;
        return (
          <div key={d.cents} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-right text-sm tabular-nums text-vtk-ink">
              {formatEuroCents(d.cents, nl)}
            </span>
            <Input
              name={`${prefix}-${d.cents}`}
              type="number"
              min={0}
              step={1}
              value={quantity === 0 ? "" : quantity}
              placeholder="0"
              onChange={(e) => {
                const next = e.target.value === "" ? 0 : Number(e.target.value);
                onChange({ ...count, [d.cents]: Number.isFinite(next) ? next : 0 });
              }}
              aria-label={`${label} — ${formatEuroCents(d.cents, nl)}`}
              className="w-20 text-right tabular-nums"
            />
            <span className="text-sm tabular-nums text-[#5c667f]">
              {quantity > 0 ? formatEuroCents(d.cents * quantity, nl) : ""}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-5 sm:grid-cols-2">
        {group(nl ? "Munten" : "Coins", COIN_DENOMINATIONS)}
        {group(nl ? "Biljetten" : "Bills", BILL_DENOMINATIONS)}
      </div>
      <p className="border-t border-vtk-blue/10 pt-2 text-sm text-[#5c667f]">
        {label}:{" "}
        <span className="font-semibold tabular-nums text-vtk-ink">
          {formatEuroCents(total, nl)}
        </span>
      </p>
    </div>
  );
}
