"use client";

import { useTransition } from "react";
import { Button } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { syncAlumniAction } from "@/app/actions/alumni";

/** "Nu synchroniseren" naar Brevo, met dezelfde toast-conventie als elders. */
export function AlumniSyncButton({ locale, enabled }: { locale: "nl" | "en"; enabled: boolean }) {
  const nl = locale === "nl";
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending || !enabled}
      onClick={() =>
        startTransition(async () => {
          const state = await syncAlumniAction();
          if (state.status === "success") {
            showToast({
              message: nl ? "Alumnilijst gesynchroniseerd" : "Alumni list synchronised",
              variant: "success",
            });
          } else if (state.status === "error") {
            showToast({
              message:
                state.code === "BREVO_DISABLED"
                  ? nl
                    ? "Brevo is niet ingesteld; er is geen sleutel geconfigureerd."
                    : "Brevo is not configured; no API key is set."
                  : nl
                    ? "Synchroniseren is mislukt."
                    : "Synchronising failed.",
              variant: "error",
              duration: 0,
            });
          }
        })
      }
    >
      {pending
        ? nl
          ? "Bezig..."
          : "Working..."
        : nl
          ? "Nu synchroniseren"
          : "Synchronise now"}
    </Button>
  );
}
