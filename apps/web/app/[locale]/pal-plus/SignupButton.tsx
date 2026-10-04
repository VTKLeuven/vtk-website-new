"use client";

import { useTransition } from "react";
import { leavePalPlusSessionAction, signUpPalPlusSessionAction } from "@/app/actions/palPlus";
import { useToast } from "@/components/ui/toast";

export type SignupCopy = {
  signUp: string;
  leave: string;
  signedUp: string;
  signedUpToast: string;
  leftToast: string;
  errors: Record<string, string>;
  fallbackError: string;
};

/**
 * Inschrijven voor een sessie, of weer uitschrijven. Ingeschreven zijn staat
 * als toestand naast de knop (met een vinkje), niet enkel in de toast.
 */
export function SignupButton({
  sessionId,
  signedUp,
  copy,
}: {
  sessionId: string;
  signedUp: boolean;
  copy: SignupCopy;
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function run(join: boolean) {
    const data = new FormData();
    data.set("sessionId", sessionId);
    startTransition(async () => {
      const result = join ? await signUpPalPlusSessionAction(data) : await leavePalPlusSessionAction(data);
      if (result.status === "error") {
        showToast({
          message: copy.errors[result.code] ?? copy.fallbackError,
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({ message: join ? copy.signedUpToast : copy.leftToast, variant: "success" });
    });
  }

  if (signedUp) {
    return (
      <div className="pp-signup">
        <span className="pp-signed">
          <span aria-hidden="true">✓</span> {copy.signedUp}
        </span>
        <button type="button" className="pp-leave" disabled={pending} onClick={() => run(false)}>
          {copy.leave}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="vtk-button vtk-button-primary pp-join"
      disabled={pending}
      onClick={() => run(true)}
    >
      {copy.signUp}
    </button>
  );
}
