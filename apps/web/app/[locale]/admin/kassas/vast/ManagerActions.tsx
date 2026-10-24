"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@vtk/ui";
import type { SaveAction } from "@/lib/saveState";
import type { PermanentEntryKind } from "@/lib/kassas/permanent";
import { EntryForm } from "./EntryForm";

/**
 * De kaart van een post voor Beheer, met de drie handelingen op een vaste kassa
 * als knoppen die één formulier openklappen onder de kaart. Hoogstens één
 * tegelijk: wie van meegeven naar tellen springt, verliest wat er nog niet
 * opgeslagen was. De kerncijfers komen als `children` van de server.
 */
export function ManagerActions({
  locale,
  action,
  groupId,
  postName,
  today,
  shiftVoucherValueCents,
  elixirVoucherValueCents,
  errorMessages,
  children,
}: {
  children: ReactNode;
  locale: "nl" | "en";
  action: SaveAction;
  groupId: string;
  postName: string;
  /** "YYYY-MM-DD", de standaarddatum en de laatste die je kan kiezen. */
  today: string;
  shiftVoucherValueCents: number;
  elixirVoucherValueCents: number;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const [open, setOpen] = useState<PermanentEntryKind | null>(null);

  const titles: Record<PermanentEntryKind, string> = {
    HANDED_OUT: nl ? `Meegeven aan ${postName}` : `Hand out to ${postName}`,
    RETURNED: nl ? `Terugkrijgen van ${postName}` : `Receive from ${postName}`,
    COUNT: nl ? `Telling ingeven voor ${postName}` : `Enter a count for ${postName}`,
  };
  const intros: Record<PermanentEntryKind, string> = {
    HANDED_OUT: nl
      ? "Wisselgeld dat Beheer aan de post geeft: de startkassa van het semester, of extra munten tussendoor."
      : "Change Administration gives the post: the semester's starting float, or extra coins in between.",
    RETURNED: nl
      ? "Geld dat de post aan Beheer afgeeft terwijl de kassa bij hen blijft."
      : "Money the post hands to Administration while the register stays with them.",
    COUNT: nl
      ? "Een telling die Beheer zelf doet, bijvoorbeeld wanneer de kassa even bij Beheer ligt. Normaal telt de post zelf."
      : "A count Administration does itself, for instance while the register is with Administration. Normally the post counts.",
  };
  const buttons: Array<{ kind: PermanentEntryKind; label: string }> = [
    { kind: "HANDED_OUT", label: nl ? "Meegeven" : "Hand out" },
    { kind: "RETURNED", label: nl ? "Terugkrijgen" : "Receive" },
    { kind: "COUNT", label: nl ? "Telling ingeven" : "Enter a count" },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-vtk-ink">{postName}</h2>
          <div className="flex flex-wrap gap-2">
            {buttons.map((button) => (
              <Button
                key={button.kind}
                type="button"
                variant={button.kind === "COUNT" ? "primary" : "ghost"}
                aria-expanded={open === button.kind}
                onClick={() => setOpen((current) => (current === button.kind ? null : button.kind))}
              >
                {button.label}
              </Button>
            ))}
          </div>
        </div>
        {children}
      </section>
      {open && (
        <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5 shadow-[inset_3px_0_0_var(--yellow)]">
          <h3 className="text-base font-semibold text-vtk-ink">{titles[open]}</h3>
          <p className="mb-4 mt-1 text-sm text-vtk-body">{intros[open]}</p>
          <EntryForm
            key={open}
            locale={locale}
            action={action}
            postName={postName}
            maxDate={today}
            shiftVoucherValueCents={shiftVoucherValueCents}
            elixirVoucherValueCents={elixirVoucherValueCents}
            errorMessages={errorMessages}
            onCancel={() => setOpen(null)}
            onSaved={() => setOpen(null)}
            values={{
              groupId,
              kind: open,
              date: today,
              cash: "",
              counts: null,
              shiftVouchers: "",
              elixirVouchers: "",
              closesRegister: false,
              note: "",
            }}
          />
        </section>
      )}
    </div>
  );
}
