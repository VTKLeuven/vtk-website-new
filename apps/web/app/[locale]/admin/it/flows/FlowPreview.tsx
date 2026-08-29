"use client";

import { useState, type ReactNode } from "react";
import { Button, Card } from "@vtk/ui";

/**
 * Eén voorvertoning: de regels erboven, het echte formulier eronder, dichtgeklapt.
 *
 * Dicht bij het openen, want deze pagina draagt twee volledige formulieren en
 * anders scrol je een halve minuut voor je bij de tweede bent. Wat er altijd
 * staat, is de vraag waarmee je hier komt: wanneer verschijnt dit scherm?
 */
export function FlowPreview({
  title,
  when,
  rules,
  yourState,
  openLabel,
  closeLabel,
  children,
}: {
  title: string;
  when: string;
  rules: ReactNode;
  yourState: ReactNode;
  openLabel: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-vtk-ink">{title}</h2>
          <p className="mt-1 text-sm text-[#5c667f]">{when}</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setOpen(!open)}>
          {open ? closeLabel : openLabel}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 p-4 text-sm text-[#34405e]">
          {rules}
        </div>
        <div className="rounded-xl border border-vtk-blue/12 bg-white p-4 text-sm text-[#34405e]">
          {yourState}
        </div>
      </div>

      {open ? (
        <div className="rounded-2xl border border-dashed border-vtk-blue/25 bg-vtk-surface p-5">
          {children}
        </div>
      ) : null}
    </Card>
  );
}
