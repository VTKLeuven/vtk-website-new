"use client";

import { useEffect, useRef } from "react";
import { formatEuro } from "@/lib/rekeningen/expenses";
import {
  countsLines,
  denominationLabel,
  piecesOf,
  STANDARD_FLOAT,
  standardPieces,
  type Counts,
  type Denomination,
} from "@/lib/kassas/kassa";

/**
 * Het wisselgeld zoals een post het aanvraagt: per munt of briefje een knop.
 * Wie een knop aanduidt, krijgt een volle rol of het vaste aantal briefjes dat
 * erop staat; het juiste aantal is de zaak van Beheer, die het bij het
 * aanvaarden nog bijstelt. Een post weet zelden of ze 30 of 40 munten van
 * 20 cent nodig heeft, wel dat ze er nodig heeft.
 *
 * Gecontroleerd door de ouder, die het totaal toont.
 */
export function FloatPicker({
  locale,
  picked,
  onChange,
  current,
}: {
  locale: "nl" | "en";
  picked: Denomination[];
  onChange: (next: Denomination[]) => void;
  /**
   * De startkassa zoals ze nu opgeslagen is. Een coupure die er al in zit, toont
   * haar eigen aantal: Beheer kan het al bijgesteld hebben, en dat blijft.
   */
  current: Counts;
}) {
  const nl = locale === "nl";

  // Een gecontroleerd vinkje volgt `form.reset()` niet; zelfde reden als in
  // `DenominationGrid`.
  const firstRef = useRef<HTMLInputElement>(null);
  const initial = useRef(picked);
  useEffect(() => {
    const form = firstRef.current?.form;
    if (!form) return;
    const onReset = () => onChange(initial.current);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [onChange]);

  // Wat een post niet kan aanduiden, maar Beheer er wel in zette.
  const extra = countsLines(current).filter((line) => standardPieces(line.denomination) === null);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STANDARD_FLOAT.map(({ denomination, pieces: standard }, index) => {
          const on = picked.includes(denomination);
          const saved = piecesOf(current, denomination);
          const pieces = saved > 0 ? saved : standard;
          const amount =
            saved > 0 && saved !== standard
              ? nl
                ? `${pieces} stuks`
                : `${pieces} pieces`
              : denomination < 500
                ? nl
                  ? `rol van ${pieces}`
                  : `roll of ${pieces}`
                : nl
                  ? `${pieces} ${pieces === 1 ? "briefje" : "briefjes"}`
                  : `${pieces} ${pieces === 1 ? "note" : "notes"}`;
          return (
            <label
              key={denomination}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
                on
                  ? "border-vtk-ink bg-vtk-blue-soft"
                  : "border-vtk-blue/15 bg-white hover:bg-vtk-blue-soft/40"
              }`}
            >
              <input
                ref={index === 0 ? firstRef : undefined}
                type="checkbox"
                name="startPick"
                value={denomination}
                checked={on}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...picked, denomination]
                      : picked.filter((candidate) => candidate !== denomination),
                  )
                }
                className="mt-0.5 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-vtk-ink">{denominationLabel(denomination)}</span>
                <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs tabular-nums text-vtk-muted">
                  <span>{amount}</span>
                  <span>{formatEuro(pieces * denomination, locale)}</span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {extra.length > 0 && (
        <p className="text-xs text-vtk-muted">
          {nl ? "Beheer zette er ook bij: " : "Administration also added: "}
          {extra.map((line) => `${line.pieces} × ${denominationLabel(line.denomination)}`).join(", ")}.
        </p>
      )}
    </div>
  );
}
