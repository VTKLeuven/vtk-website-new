"use client";

import { useState } from "react";
import { Button } from "@vtk/ui";
import type { SaveAction } from "@/lib/saveState";
import type { CashBookKind } from "@/lib/kassas/cashBook";
import { CashBookForm } from "./CashBookForm";

/**
 * De drie handelingen op het cash van Beheer als knoppen die één formulier
 * openklappen, zoals de vaste kassa's (`vast/ManagerActions.tsx`). Hoogstens
 * één tegelijk.
 */
export function CashBookActions({
  locale,
  action,
  today,
  errorMessages,
}: {
  locale: "nl" | "en";
  action: SaveAction;
  /** "YYYY-MM-DD": de standaarddatum en de laatste die je kan kiezen. */
  today: string;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const [open, setOpen] = useState<CashBookKind | null>(null);

  const buttons: Array<{ kind: CashBookKind; label: string }> = [
    { kind: "WITHDRAWAL", label: nl ? "Afhaling" : "Withdrawal" },
    { kind: "DEPOSIT", label: nl ? "Storting" : "Deposit" },
    { kind: "PURCHASE", label: nl ? "Aankoop" : "Purchase" },
  ];
  const titles: Record<CashBookKind, string> = {
    WITHDRAWAL: nl ? "Cash afgehaald van de bank" : "Cash withdrawn from the bank",
    DEPOSIT: nl ? "Cash gestort op de bank" : "Cash deposited at the bank",
    PURCHASE: nl ? "Iets met cash betaald" : "Something paid in cash",
  };
  const intros: Record<CashBookKind, string> = {
    WITHDRAWAL: nl
      ? "Geld dat je van de rekening van VTK afhaalde, bijvoorbeeld voor wisselgeld."
      : "Money you took from the VTK account, for instance for change.",
    DEPOSIT: nl
      ? "Cash dat je op de rekening van VTK stortte, bijvoorbeeld de opbrengst van de kassa's."
      : "Cash you paid into the VTK account, for instance the takings of the registers.",
    PURCHASE: nl
      ? "Een aankoop die je met het cash van VTK betaalde. Voeg altijd de factuur toe."
      : "A purchase you paid with VTK's cash. Always add the invoice.",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {buttons.map((button) => (
          <Button
            key={button.kind}
            type="button"
            variant={open === button.kind ? "primary" : "ghost"}
            aria-expanded={open === button.kind}
            onClick={() => setOpen((current) => (current === button.kind ? null : button.kind))}
          >
            {button.label}
          </Button>
        ))}
      </div>
      {open && (
        <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5 shadow-[inset_3px_0_0_var(--yellow)]">
          <h3 className="text-base font-semibold text-vtk-ink">{titles[open]}</h3>
          <p className="mb-4 mt-1 text-sm text-vtk-body">{intros[open]}</p>
          <CashBookForm
            key={open}
            locale={locale}
            action={action}
            maxDate={today}
            errorMessages={errorMessages}
            onCancel={() => setOpen(null)}
            onSaved={() => setOpen(null)}
            values={{ kind: open, date: today, amount: "", description: "", note: "" }}
          />
        </section>
      )}
    </div>
  );
}
