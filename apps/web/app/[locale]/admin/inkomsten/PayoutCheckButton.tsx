"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, UndoIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import type { SaveState } from "@/lib/saveState";

/**
 * Een Mollie-uitbetaling afvinken tegen het uittreksel, of het vinkje
 * weghalen. Geen bevestiging: het vinkje is met één klik terug te zetten, en
 * het zegt enkel dat iemand het bedrag op het uittreksel zag.
 */
export function PayoutCheckButton({
  reference,
  checked,
  action,
  locale,
  errorMessages,
}: {
  reference: string;
  checked: boolean;
  action: (formData: FormData) => Promise<SaveState>;
  locale: "nl" | "en";
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const showToast = useToast();
  const [pending, startTransition] = useTransition();

  function toggle() {
    const form = new FormData();
    form.append("reference", reference);
    form.append("checked", checked ? "0" : "1");
    startTransition(async () => {
      const result = await action(form);
      if (result.status === "error") {
        showToast({
          message: errorMessages[result.code] ?? result.detail ?? (nl ? "Dat lukte niet." : "That did not work."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: checked
          ? nl
            ? "Vinkje weggehaald."
            : "Check removed."
          : nl
            ? "Afgevinkt tegen het uittreksel."
            : "Checked against the bank statement.",
        variant: "success",
      });
      router.refresh();
    });
  }

  return checked ? (
    <IconButton
      label={nl ? "Vinkje weghalen" : "Remove check"}
      srLabel={nl ? `Vinkje weghalen: ${reference}` : `Remove check: ${reference}`}
      onClick={toggle}
      disabled={pending}
    >
      <UndoIcon />
    </IconButton>
  ) : (
    <IconButton
      label={nl ? "Afvinken: staat zo op het uittreksel" : "Check: matches the bank statement"}
      srLabel={nl ? `Afvinken: ${reference}` : `Check: ${reference}`}
      onClick={toggle}
      disabled={pending}
    >
      <CheckIcon />
    </IconButton>
  );
}
