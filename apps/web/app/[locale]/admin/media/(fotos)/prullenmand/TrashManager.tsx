"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { restoreAlbumAction, restorePhotosAction } from "@/app/actions/media-albums";
import { TRASH_DAYS, adminThumbnailUrl, trashDaysLeft } from "@/lib/media-admin-shared";
import { SAVE_IDLE, type SaveAction } from "@/lib/saveState";
import type { TrashedAlbum, TrashedPhoto } from "@/lib/media-admin";
import { albumErrorMessages } from "../messages";

/**
 * Terugzetten is hier niet destructief, dus geen bevestiging: een klik en het
 * staat weer waar het stond. Weggooien gebeurt in het album zelf.
 */
export function TrashManager({
  locale,
  photos,
  albums,
  now,
}: {
  locale: string;
  photos: TrashedPhoto[];
  albums: TrashedAlbum[];
  /** Van de server, zodat "nog 12 dagen" niet verspringt bij het hydrateren. */
  now: string;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const messages = albumErrorMessages(nl ? "nl" : "en");
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const moment = useMemo(() => new Date(now), [now]);

  const daysLeft = (iso: string) => {
    const days = trashDaysLeft(new Date(iso), moment);
    return nl ? `nog ${days} ${days === 1 ? "dag" : "dagen"}` : `${days} ${days === 1 ? "day" : "days"} left`;
  };

  // Per album, zodat je ziet waar een foto vandaan komt zonder elke foto te lezen.
  const groups = useMemo(() => {
    const out: Array<{ key: string; title: string; photos: TrashedPhoto[] }> = [];
    for (const photo of photos) {
      const title = photo.tabName ? `${photo.albumTitle} · ${photo.tabName}` : photo.albumTitle;
      const last = out.find((group) => group.key === photo.albumId);
      if (last) last.photos.push(photo);
      else out.push({ key: photo.albumId, title, photos: [photo] });
    }
    return out;
  }, [photos]);

  function run(action: SaveAction, fields: Record<string, string>, success: string) {
    startTransition(async () => {
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) data.set(key, value);
      const state = await action(SAVE_IDLE, data);
      if (state.status === "success") {
        showToast({ message: success, variant: "success" });
        setSelected(new Set());
      } else if (state.status === "error") {
        showToast({
          message: messages[state.code] ?? state.detail ?? (nl ? "Niet teruggezet." : "Not restored."),
          variant: "error",
          duration: 0,
        });
      }
    });
  }

  const restorePhotos = (ids: string[]) =>
    run(
      restorePhotosAction,
      { assetIds: ids.join(",") },
      nl
        ? `${ids.length} foto${ids.length === 1 ? "" : "'s"} teruggezet in het album.`
        : `${ids.length} photo${ids.length === 1 ? "" : "s"} put back in the album.`,
    );

  const empty = photos.length === 0 && albums.length === 0;

  return (
    <div className="media-trash">
      <div className="media-trash-head">
        <h2>{nl ? "Prullenmand" : "Trash"}</h2>
        <p>
          {nl
            ? `Wat je verwijdert, blijft hier ${TRASH_DAYS} dagen staan. Zet het terug zolang dat kan; daarna is het definitief weg.`
            : `What you delete stays here for ${TRASH_DAYS} days. Put it back while you can; after that it is gone for good.`}
        </p>
      </div>

      {empty ? (
        <p className="ticket-admin-empty-state">
          {nl
            ? "Niets in de prullenmand. Verwijder je foto's of een album, dan vind je ze hier terug."
            : "Nothing in the trash. When you delete photos or an album, you find them back here."}
        </p>
      ) : null}

      {albums.length > 0 ? (
        <section className="media-trash-section">
          <h3>{nl ? "Albums" : "Albums"}</h3>
          <ul className="media-trash-albums">
            {albums.map((album) => (
              <li key={album.albumId}>
                <span>
                  <b>{album.title}</b>
                  <small className="num">
                    {nl ? `${album.photoCount} foto's` : `${album.photoCount} photos`} · {daysLeft(album.trashedAt)}
                  </small>
                </span>
                <button
                  type="button"
                  className="ticket-admin-button"
                  disabled={pending}
                  onClick={() =>
                    run(
                      restoreAlbumAction,
                      { albumId: album.albumId },
                      nl ? `${album.title} staat weer in de lijst.` : `${album.title} is back in the list.`,
                    )
                  }
                >
                  <RotateCcw aria-hidden="true" size={15} />
                  {nl ? "Terugzetten" : "Restore"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.map((group) => (
        <section key={group.key} className="media-trash-section">
          <div className="media-trash-section-head">
            <h3>{group.title}</h3>
            <button
              type="button"
              className="ticket-admin-button"
              disabled={pending}
              onClick={() => restorePhotos(group.photos.map((photo) => photo.assetId))}
            >
              <RotateCcw aria-hidden="true" size={15} />
              {group.photos.length === 1
                ? nl
                  ? "Terugzetten"
                  : "Restore"
                : nl
                  ? `Alle ${group.photos.length} terugzetten`
                  : `Restore all ${group.photos.length}`}
            </button>
          </div>
          <ul className="media-photo-grid" data-selecting={selected.size > 0 ? "true" : undefined}>
            {group.photos.map((photo, index) => {
              const isSelected = selected.has(photo.assetId);
              return (
                <li key={photo.assetId} className="media-photo" data-selected={isSelected ? "true" : undefined}>
                  <button
                    type="button"
                    className="media-photo-hit"
                    aria-pressed={isSelected}
                    aria-label={nl ? `Foto ${index + 1} uit ${group.title}` : `Photo ${index + 1} from ${group.title}`}
                    onClick={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(photo.assetId)) next.delete(photo.assetId);
                        else next.add(photo.assetId);
                        return next;
                      })
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={adminThumbnailUrl(photo.assetId)} alt="" loading="lazy" decoding="async" />
                    <span className="media-photo-check" aria-hidden="true">
                      <Check size={13} strokeWidth={3} />
                    </span>
                  </button>
                  <span className="media-photo-badge is-days num">{daysLeft(photo.trashedAt)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {selected.size > 0 ? (
        <div className="media-selection-bar" role="toolbar" aria-label={nl ? "Selectie" : "Selection"}>
          <b className="num">
            {selected.size} {nl ? "geselecteerd" : "selected"}
          </b>
          <button type="button" disabled={pending} onClick={() => restorePhotos([...selected])}>
            <RotateCcw aria-hidden="true" size={15} />
            {nl ? "Terugzetten" : "Restore"}
          </button>
          <button type="button" onClick={() => setSelected(new Set())}>
            {nl ? "Selectie wissen" : "Clear selection"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
