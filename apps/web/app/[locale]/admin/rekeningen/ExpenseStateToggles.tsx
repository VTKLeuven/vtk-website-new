"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE, type SaveAction } from "@/lib/saveState";

/**
 * De twee vinkjes van de boekhouding: terugbetaald en ingeboekt.
 *
 * Elk vinkje is meteen een opslag, dus elk vinkje meldt ook meteen zijn uitkomst
 * (zie CLAUDE.md: opslaan zonder feedback is een bug). Bij een fout draait de
 * weergave niet zelf terug: `router.refresh()` haalt de echte stand op, zodat er
 * nooit een vinkje blijft staan dat de database niet kent.
 */
export function ExpenseStateToggles({
  expenseId,
  locale,
  action,
  paidAt,
  paidBy,
  bookedAt,
  bookedBy,
  sentAt,
  sentTo,
  readOnly,
  labels,
}: {
  expenseId: string;
  locale: "nl" | "en";
  action: SaveAction;
  paidAt: string | null;
  paidBy: string | null;
  bookedAt: string | null;
  bookedBy: string | null;
  sentAt: string | null;
  sentTo: string | null;
  /** Kijken mag, wijzigen niet (post-beheer en de indiener zelf). */
  readOnly: boolean;
  labels: {
    savedMessage: string;
    fallbackErrorMessage: string;
    errorMessages: Record<string, string>;
  };
}) {
  const nl = locale === "nl";

  return (
    <div className="space-y-2 border-t border-vtk-blue/10 pt-3">
      <Toggle
        expenseId={expenseId}
        action={action}
        field="paid"
        checked={paidAt !== null}
        label={nl ? "Terugbetaald" : "Reimbursed"}
        detail={paidAt ? [paidAt, paidBy].filter(Boolean).join(" · ") : "—"}
        readOnly={readOnly}
        labels={labels}
      />
      <Toggle
        expenseId={expenseId}
        action={action}
        field="booked"
        checked={bookedAt !== null}
        label={nl ? "Ingeboekt" : "Booked"}
        detail={bookedAt ? [bookedAt, bookedBy].filter(Boolean).join(" · ") : "—"}
        readOnly={readOnly}
        labels={labels}
      />
      {/* Doorgestuurd is geen vinkje: het wordt gezet door de mail effectief te
          versturen, en niet door te beweren dat je dat deed. */}
      <div className="flex items-center gap-2.5 text-sm">
        <span
          aria-hidden
          className={`grid size-4 shrink-0 place-items-center rounded border ${
            sentAt ? "border-vtk-ink bg-vtk-ink text-white" : "border-zinc-400 bg-white"
          }`}
        >
          {sentAt ? <CheckMark /> : null}
        </span>
        <span className="text-vtk-ink">{nl ? "Doorgestuurd" : "Forwarded"}</span>
        <span className="ml-auto truncate text-xs text-[#5c667f]">
          {sentAt ? [sentAt, sentTo].filter(Boolean).join(" · ") : "—"}
        </span>
      </div>
    </div>
  );
}

function Toggle({
  expenseId,
  action,
  field,
  checked,
  label,
  detail,
  readOnly,
  labels,
}: {
  expenseId: string;
  action: SaveAction;
  field: "paid" | "booked";
  checked: boolean;
  label: string;
  detail: string;
  readOnly: boolean;
  labels: {
    savedMessage: string;
    fallbackErrorMessage: string;
    errorMessages: Record<string, string>;
  };
}) {
  const [state, formAction, pending] = useActionState(action, SAVE_IDLE);
  const showToast = useToast();
  const router = useRouter();
  const handled = useRef<number | null>(null);

  useEffect(() => {
    if (state.status === "idle" || handled.current === state.nonce) return;
    handled.current = state.nonce;
    if (state.status === "success") {
      showToast({ message: labels.savedMessage, variant: "success" });
    } else {
      showToast({
        message: labels.errorMessages[state.code] ?? state.detail ?? labels.fallbackErrorMessage,
        variant: "error",
        duration: 0,
      });
    }
    router.refresh();
  }, [state, showToast, labels, router]);

  function toggle() {
    const data = new FormData();
    data.set("id", expenseId);
    data.set("field", field);
    data.set("value", checked ? "0" : "1");
    startTransition(() => formAction(data));
  }

  return (
    <div className="flex items-center gap-2.5 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={readOnly || pending}
        onClick={toggle}
        className={`grid size-4 shrink-0 place-items-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? "border-vtk-ink bg-vtk-ink text-white" : "border-zinc-400 bg-white"
        }`}
      >
        {checked ? <CheckMark /> : null}
        <span className="sr-only">{label}</span>
      </button>
      <span className="text-vtk-ink">{label}</span>
      <span className="ml-auto truncate text-xs text-[#5c667f]">{detail}</span>
    </div>
  );
}

function CheckMark() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
