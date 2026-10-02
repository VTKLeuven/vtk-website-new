"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconButton } from "@/components/ui/IconButton";
import { ImageIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { setMagazineCoverAction } from "@/app/actions/media";

/**
 * Maakt de kaft van een editie opnieuw uit bladzijde 1 van haar pdf, op de
 * server (lib/magazineCover.ts). Een editie zonder kaft krijgt er ook vanzelf
 * een; dit is de knop om niet te wachten, of om een kaft te vervangen.
 */
export function MagazineCoverButton({
  id,
  hasCover,
  context,
  locale,
}: {
  id: string;
  hasCover: boolean;
  /** Titel en editie, voor de screenreader. */
  context: string;
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const label = hasCover
    ? nl
      ? "Kaft opnieuw maken van bladzijde 1"
      : "Remake cover from page 1"
    : nl
      ? "Kaft maken van bladzijde 1"
      : "Make cover from page 1";

  async function makeCover() {
    setBusy(true);
    try {
      const data = new FormData();
      data.set("id", id);
      const result = await setMagazineCoverAction(data);
      if (result.status === "success") {
        toast({ message: nl ? "Kaft gemaakt" : "Cover made", variant: "success" });
        startTransition(() => router.refresh());
      } else {
        throw new Error(result.status === "error" ? result.code : "unknown");
      }
    } catch {
      toast({
        message: nl
          ? "Geen kaft gemaakt: de eerste bladzijde van de pdf kon niet gelezen worden."
          : "No cover made: the first page of the pdf could not be read.",
        variant: "error",
        duration: 0,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <IconButton label={label} srLabel={`${label}: ${context}`} onClick={makeCover} disabled={busy}>
      <ImageIcon />
    </IconButton>
  );
}
