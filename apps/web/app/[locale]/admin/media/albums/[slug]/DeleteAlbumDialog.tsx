"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE } from "@/lib/saveState";
import { deleteAlbumAction } from "@/app/actions/media-albums";
import { albumErrorMessages } from "./messages";

/**
 * Het album verwijderen, met de keuze om de foto's mee weg te gooien.
 *
 * Die keuze staat er omdat een Immich-album verwijderen de foto's **niet** wist:
 * ze blijven in de bibliotheek staan en in elk ander album waar ze in zitten. Een
 * kale "verwijderen" zou dus iets anders doen dan wat ze belooft.
 */
export function DeleteAlbumDialog({
  locale,
  slug,
  title,
  photoCount,
  tabNames,
  backHref,
}: {
  locale: Locale;
  slug: string;
  title: string;
  photoCount: number;
  tabNames: string[];
  backHref: string;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const showToast = useToast();
  const messages = albumErrorMessages(locale);
  const [open, setOpen] = useState(false);
  const [alsoTrashPhotos, setAlsoTrashPhotos] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const data = new FormData();
      data.set("slug", slug);
      data.set("alsoTrashPhotos", alsoTrashPhotos ? "true" : "false");
      const state = await deleteAlbumAction(SAVE_IDLE, data);
      if (state.status === "success") {
        setOpen(false);
        showToast({ message: nl ? "Album verwijderd." : "Album deleted.", variant: "success" });
        router.push(backHref);
        return;
      }
      if (state.status === "error") {
        showToast({
          message: messages[state.code] ?? (nl ? "Niet gelukt." : "Failed."),
          variant: "error",
          duration: 0,
        });
      }
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {nl ? "Album verwijderen" : "Delete album"}
      </Button>
      <ConfirmDialog
        open={open}
        title={nl ? `"${title}" verwijderen?` : `Delete "${title}"?`}
        description={
          <div className="space-y-2">
            <p>
              {tabNames.length > 1
                ? nl
                  ? `Het album verdwijnt uit Immich, samen met zijn ${tabNames.length} tabs (${tabNames.join(", ")}).`
                  : `The album disappears from Immich, together with its ${tabNames.length} tabs (${tabNames.join(", ")}).`
                : nl
                  ? "Het album verdwijnt uit Immich."
                  : "The album disappears from Immich."}
            </p>
            <p>
              {nl
                ? `De ${photoCount} foto's blijven in Immich staan, tenzij je ze hieronder mee weggooit.`
                : `The ${photoCount} photos stay in Immich unless you throw them away below.`}
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={alsoTrashPhotos}
                onChange={(event) => setAlsoTrashPhotos(event.target.checked)}
                className="mt-1"
              />
              <span>
                {nl
                  ? "Ook de foto's naar de prullenmand van Immich (daar een maand terug te halen)."
                  : "Also move the photos to Immich's trash (recoverable there for a month)."}
              </span>
            </label>
          </div>
        }
        confirmLabel={nl ? "Verwijderen" : "Delete"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
      />
    </>
  );
}
