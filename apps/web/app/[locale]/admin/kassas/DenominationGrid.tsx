"use client";

import { useEffect, useRef } from "react";
import { formatEuro } from "@/lib/rekeningen/expenses";
import {
  DENOMINATIONS,
  denominationLabel,
  parseCountInput,
  type Counts,
  type Denomination,
} from "@/lib/kassas/kassa";

/** Wat er in de velden staat, per coupure; een leeg veld is "". */
export type CountInputs = Record<`${Denomination}`, string>;

/**
 * De velden voor een opgeslagen telling. Een getelde eindkassa toont haar nullen,
 * want alles leeg betekent "nog niet geteld" (`endCounts` NULL). Bij de
 * startkassa is een leeg veld gewoon nul stuks, en leest een raster zonder nullen
 * rustiger: daar `emptyZero`.
 */
export function countInputsFrom(counts: Counts | null, emptyZero = false): CountInputs {
  return Object.fromEntries(
    DENOMINATIONS.map((denomination) => {
      const pieces = counts?.[`${denomination}`];
      const zero = counts && !emptyZero ? "0" : "";
      return [`${denomination}`, pieces === undefined ? zero : String(pieces)];
    }),
  ) as CountInputs;
}

/** Het totaal van de velden; een ongeldig of leeg veld telt als nul. */
export function inputsTotalCents(inputs: CountInputs): number {
  return DENOMINATIONS.reduce((sum, denomination) => {
    const pieces = parseCountInput(inputs[`${denomination}`]);
    return sum + (typeof pieces === "number" ? pieces * denomination : 0);
  }, 0);
}

/** Staat er in minstens één veld iets? Zo niet, dan is er niet geteld. */
export function inputsFilled(inputs: CountInputs): boolean {
  return DENOMINATIONS.some((denomination) => inputs[`${denomination}`].trim() !== "");
}

/**
 * De elf coupures als een raster van kleine velden, met per coupure het
 * bedrag eronder. Dezelfde rijen als het kassablad, maar naast elkaar in
 * plaats van onder elkaar, zodat een hele kassa op één scherm past.
 *
 * Gecontroleerd door de ouder, want die rekent met het totaal (het resultaat
 * van de kassa staat naast het raster). `compare` toont per coupure een
 * tweede aantal ter vergelijking: de beginkassa naast de eindkassa.
 */
export function DenominationGrid({
  locale,
  prefix,
  values,
  onChange,
  compare,
  compareLabel,
  idPrefix,
}: {
  locale: "nl" | "en";
  /** Naam van de velden: `<prefix><centen>`, bv. `start_50`. */
  prefix: string;
  values: CountInputs;
  onChange: (next: CountInputs) => void;
  compare?: Counts;
  compareLabel?: string;
  idPrefix: string;
}) {
  // Een gecontroleerd veld volgt `form.reset()` niet; na een geslaagde aanvraag
  // moet het raster mee leeg, anders staat het wisselgeld van de vorige kassa er
  // nog in terwijl de rest van het formulier leeg is.
  const firstRef = useRef<HTMLInputElement>(null);
  const initial = useRef(values);
  useEffect(() => {
    const form = firstRef.current?.form;
    if (!form) return;
    const onReset = () => onChange(initial.current);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [onChange]);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {DENOMINATIONS.map((denomination, index) => {
        const key = `${denomination}` as const;
        const pieces = parseCountInput(values[key]);
        const invalid = pieces === undefined;
        const subtotal = typeof pieces === "number" ? pieces * denomination : 0;
        const id = `${idPrefix}-${denomination}`;
        return (
          <div key={denomination} className="rounded-xl border border-vtk-blue/12 bg-white px-3 py-2">
            <label htmlFor={id} className="block text-xs font-semibold text-vtk-ink">
              {denominationLabel(denomination)}
            </label>
            <input
              ref={index === 0 ? firstRef : undefined}
              id={id}
              name={`${prefix}${denomination}`}
              inputMode="numeric"
              autoComplete="off"
              value={values[key]}
              onChange={(event) => onChange({ ...values, [key]: event.target.value })}
              aria-invalid={invalid || undefined}
              placeholder="0"
              className={`mt-1 h-9 w-full rounded-lg border px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-vtk-yellow ${
                invalid ? "border-vtk-danger-line bg-vtk-danger-soft" : "border-vtk-blue/15 bg-vtk-blue-muted"
              }`}
            />
            <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px] tabular-nums text-vtk-muted">
              <span>
                {compare && compareLabel ? `${compareLabel} ${compare[key] ?? 0}` : ""}
              </span>
              <span>{subtotal > 0 ? formatEuro(subtotal, locale) : ""}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
