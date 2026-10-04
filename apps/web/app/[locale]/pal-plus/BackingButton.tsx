"use client";

import { useTransition } from "react";
import { setPalPlusBackingAction } from "@/app/actions/palPlus";
import { useToast } from "@/components/ui/toast";

export type BackingCopy = {
  back: string;
  backed: string;
  backedToast: string;
  unbackedToast: string;
  mine: string;
  errors: Record<string, string>;
  fallbackError: string;
};

/**
 * "Ik zoek dit ook": een vraag steunen, of die steun weer intrekken.
 *
 * Geen `<form>`: de knop staat ook binnen het aanvraagformulier (bij de
 * dubbelwaarschuwing), en een formulier in een formulier bestaat niet. De
 * toestand zit in de knop zelf (`aria-pressed`), niet enkel in de toast.
 */
export function BackingButton({
  requestId,
  backed,
  mine,
  copy,
}: {
  requestId: string;
  backed: boolean;
  mine: boolean;
  copy: BackingCopy;
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  if (mine) return <span className="pp-mine-tag">{copy.mine}</span>;

  function toggle() {
    const data = new FormData();
    data.set("requestId", requestId);
    data.set("intent", backed ? "unback" : "back");
    startTransition(async () => {
      const result = await setPalPlusBackingAction(data);
      if (result.status === "error") {
        showToast({
          message: copy.errors[result.code] ?? copy.fallbackError,
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({ message: backed ? copy.unbackedToast : copy.backedToast, variant: "success" });
    });
  }

  return (
    <button
      type="button"
      className="pp-back"
      aria-pressed={backed}
      disabled={pending}
      onClick={toggle}
    >
      <span aria-hidden="true" className="pp-back-mark">
        {backed ? "✓" : "+"}
      </span>
      {backed ? copy.backed : copy.back}
    </button>
  );
}
