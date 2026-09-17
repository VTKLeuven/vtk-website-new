"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE } from "@/lib/saveState";
import { restorePhotoAction, trashPhotosAction } from "@/app/actions/media-albums";
import { albumErrorMessages } from "./messages";

type DetachedPhoto = {
  assetId: string;
  filename: string | null;
  tabName: string | null;
  albumId: string;
};

/**
 * Foto's die uit dit album gehaald zijn en nog in Immich staan.
 *
 * De duimnagel loopt hier over de beheerroute met de API-sleutel: deze foto's
 * zitten in geen enkel album meer, en de publieke foto-URL's hangen aan de
 * gedeelde link van een album.
 */
export function DetachedPhotos({
  locale,
  photos,
  tabs,
}: {
  locale: Locale;
  photos: DetachedPhoto[];
  tabs: Array<{ id: string; title: string }>;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const showToast = useToast();
  const messages = albumErrorMessages(locale);
  const [pending, startTransition] = useTransition();
  const [targets, setTargets] = useState<Record<string, string>>({});

  function act(action: typeof restorePhotoAction, data: FormData, success: string) {
    startTransition(async () => {
      const state = await action(SAVE_IDLE, data);
      if (state.status === "success") {
        showToast({ message: success, variant: "success" });
        router.refresh();
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
    <Card className="p-5">
      <h2 className="mb-1 font-semibold">{nl ? "Uit het album gehaald" : "Taken out of the album"}</h2>
      <p className="mb-3 text-sm text-zinc-500">
        {nl
          ? "Deze foto's staan niet op de site maar bestaan nog in Immich. Zet ze terug of gooi ze alsnog weg."
          : "These photos are not on the site but still exist in Immich. Put them back or throw them away after all."}
      </p>

      <ul className="space-y-2">
        {photos.map((photo) => {
          const target = targets[photo.assetId] ?? photo.albumId;
          return (
            <li key={photo.assetId} className="flex flex-wrap items-center gap-3 border-b border-zinc-100 pb-2 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/admin/immich-gallery/assets/${encodeURIComponent(photo.assetId)}/thumbnail`}
                alt={photo.filename ?? photo.assetId}
                loading="lazy"
                decoding="async"
                className="size-14 rounded-md border border-vtk-blue/15 object-cover"
              />
              <span className="flex-1 truncate">
                {photo.filename ?? photo.assetId}
                {photo.tabName ? <span className="ml-2 text-xs text-zinc-500">({photo.tabName})</span> : null}
              </span>

              {tabs.length > 1 ? (
                <select
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                  value={target}
                  onChange={(event) =>
                    setTargets((current) => ({ ...current, [photo.assetId]: event.target.value }))
                  }
                >
                  {tabs.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.title}
                    </option>
                  ))}
                </select>
              ) : null}

              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => {
                  const data = new FormData();
                  data.set("assetId", photo.assetId);
                  data.set("toAlbumId", target);
                  act(restorePhotoAction, data, nl ? "Foto teruggezet." : "Photo restored.");
                }}
              >
                {nl ? "Terugzetten" : "Restore"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  const data = new FormData();
                  data.set("assetIds", photo.assetId);
                  act(trashPhotosAction, data, nl ? "Foto naar de prullenmand." : "Photo moved to the trash.");
                }}
              >
                {nl ? "Naar de prullenmand" : "To the trash"}
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
