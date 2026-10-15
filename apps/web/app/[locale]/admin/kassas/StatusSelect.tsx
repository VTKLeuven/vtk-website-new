"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import type { SaveState } from "@/lib/saveState";
import { SETTABLE_STATUSES, STATUS_SLUGS, statusLabel, type CashRegisterStatus } from "@/lib/kassas/kassa";

/**
 * De status als keuzelijst, zoals de kolom in het rekenblad: een kassa gaat
 * vaak in één ronde van "teruggebracht" naar "geteld", en dan is een klik per
 * rij sneller dan elke kassa openen. Kiezen is opslaan; de toast zegt of het
 * lukte, en bij een fout springt de lijst terug.
 *
 * Enkel na de aanvaarding: van "aangevraagd" naar verder gaat via aanvaarden,
 * want dan vertrekt de mail. De kleur per status is die van het rekenblad
 * (`.vtk-kassa-status`), zodat Beheer de kolom nog op kleur leest.
 */
export function StatusSelect({
  id,
  status,
  action,
  locale,
  label,
  errorMessages,
}: {
  id: string;
  status: Exclude<CashRegisterStatus, "REQUESTED">;
  action: (formData: FormData) => Promise<SaveState>;
  locale: "nl" | "en";
  /** Voor de screenreader: "Status: Croque bar". */
  label: string;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const showToast = useToast();
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();

  function onChange(next: Exclude<CashRegisterStatus, "REQUESTED">) {
    const previous = value;
    setValue(next);
    const form = new FormData();
    form.append("id", id);
    form.append("status", next);
    startTransition(async () => {
      const result = await action(form);
      if (result.status === "error") {
        setValue(previous);
        showToast({
          message: errorMessages[result.code] ?? result.detail ?? (nl ? "Status niet gewijzigd." : "Status not changed."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: nl ? `Status: ${statusLabel(next, true).toLowerCase()}.` : `Status: ${statusLabel(next, false).toLowerCase()}.`,
        variant: "success",
      });
      router.refresh();
    });
  }

  return (
    <span data-row-action>
      <select
        aria-label={label}
        value={value}
        disabled={pending}
        onChange={(event) => onChange(event.target.value as Exclude<CashRegisterStatus, "REQUESTED">)}
        data-status={STATUS_SLUGS[value]}
        className="vtk-kassa-status h-8 rounded-full border px-3 text-sm focus:outline-none disabled:opacity-60"
      >
        {SETTABLE_STATUSES.map((option) => (
          <option key={option} value={option}>
            {statusLabel(option, nl)}
          </option>
        ))}
      </select>
    </span>
  );
}
