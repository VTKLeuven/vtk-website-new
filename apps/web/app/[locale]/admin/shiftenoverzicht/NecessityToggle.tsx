"use client";

import { useOptimistic, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { setPraesidiumShiftNecessityAction } from "@/app/actions/praesidiumShifts";

/**
 * Schakelaar tussen "uit noodzaak" en "vrije wil" voor één of meer
 * inschrijvingen op dezelfde shift. Slaat meteen op en meldt het met een toast;
 * de knop toont de nieuwe stand al voor de server antwoordt.
 */
export function NecessityToggle({
  shiftId,
  userIds,
  necessary,
  locale,
  label,
  srLabel,
  compact = false,
}: {
  shiftId: string;
  userIds: string[];
  necessary: boolean;
  locale: "nl" | "en";
  /** Tekst op de knop; standaard de stand zelf. */
  label?: string;
  srLabel?: string;
  compact?: boolean;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(necessary);

  function toggle() {
    const next = !shown;
    startTransition(async () => {
      setShown(next);
      const data = new FormData();
      data.set("shiftId", shiftId);
      data.set("userIds", userIds.join(","));
      data.set("necessary", next ? "1" : "0");
      const result = await setPraesidiumShiftNecessityAction(data);
      if (result.status === "error") {
        showToast({
          message: nl
            ? "Niet opgeslagen: deze inschrijving bestaat niet meer. Herlaad de pagina."
            : "Not saved: this registration no longer exists. Reload the page.",
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: next
          ? nl
            ? "Aangeduid als noodzakelijk."
            : "Marked as taken out of necessity."
          : nl
            ? "Aangeduid als vrije wil."
            : "Marked as voluntary.",
        variant: "success",
      });
    });
  }

  const text = label ?? (shown ? (nl ? "Noodzakelijk" : "Necessary") : nl ? "Vrije wil" : "Voluntary");
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={shown}
      aria-label={srLabel}
      title={
        shown
          ? nl
            ? "Uit noodzaak opgenomen. Klik om er vrije wil van te maken."
            : "Taken out of necessity. Click to make it voluntary."
          : nl
            ? "Uit vrije wil opgenomen. Klik als het praesidium gevraagd werd deze shift te vullen."
            : "Taken voluntarily. Click if the praesidium was asked to fill this shift."
      }
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors disabled:opacity-60 ${
        compact ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
      } ${
        shown
          ? "border-vtk-yellow-dark/60 bg-vtk-yellow/40 text-vtk-ink hover:bg-vtk-yellow/60"
          : "border-vtk-blue/15 bg-white text-vtk-muted hover:border-vtk-blue/30 hover:text-vtk-ink"
      }`}
    >
      <span
        aria-hidden
        className={`inline-block size-2 rounded-full ${shown ? "bg-[var(--chart-2)]" : "bg-[var(--chart-3)]"}`}
      />
      {text}
    </button>
  );
}
