"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { setFormStatusAction } from "@/app/actions/forms";
import { useToast } from "@/components/ui/toast";
import { formStatusLabel, formStatusTone, type AdminLocale } from "./format";

const STATUSES = ["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"] as const;

/**
 * De status van een formulier wisselen zonder het te openen.
 *
 * Bewust een native `<select>` en geen `ThemedSelect`: dit staat in een tabel met
 * `overflow-x: auto` en in een kaart met `overflow: hidden`, en een keuzelijst
 * die zichzelf in de pagina tekent, wordt daar afgeknipt. Een native lijst tekent
 * het besturingssysteem, dus die ontsnapt eraan.
 */
export function FormStatusSelect({
  formId,
  status,
  locale,
  formTitle,
}: {
  formId: string;
  status: string;
  locale: AdminLocale;
  formTitle: string;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const showToast = useToast();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    if (next === status) return;
    startTransition(async () => {
      const state = await setFormStatusAction(formId, next, locale);
      if (state.status === "error") {
        showToast({
          message:
            state.code === "NO_FIELDS_TO_PUBLISH"
              ? nl
                ? "Voeg eerst minstens één veld toe voor je de form online zet."
                : "Add at least one field before putting the form online."
              : nl
                ? "De status wijzigen is niet gelukt."
                : "Changing the status failed.",
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: nl
          ? `Status is nu: ${formStatusLabel(next, locale)}`
          : `Status is now: ${formStatusLabel(next, locale)}`,
        variant: "success",
      });
      router.refresh();
    });
  }

  return (
    <span
      className="form-admin-status-select ticket-admin-status"
      data-tone={formStatusTone(status)}
    >
      <span className="ticket-admin-status-dot" aria-hidden="true" />
      <select
        value={status}
        disabled={pending}
        aria-label={`${nl ? "Status van" : "Status of"} ${formTitle}`}
        onChange={(event) => change(event.target.value)}
      >
        {STATUSES.map((option) => (
          <option key={option} value={option}>
            {formStatusLabel(option, locale)}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" size={13} />
    </span>
  );
}
