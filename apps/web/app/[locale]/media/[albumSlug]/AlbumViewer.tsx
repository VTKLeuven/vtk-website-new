"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trackPhotoDownload } from "@/lib/analytics-client";
import { TakedownDialog, type TakedownLabels } from "./TakedownDialog";

/**
 * Hoeveel duimnagels meteen laden in plaats van lazy. De bovenste rij is het
 * LCP-beeld van de pagina, en die stond met `loading="lazy"` precies op de foto
 * te wachten waarop gemeten wordt. Vier kolommen in de masonry, plus een rij
 * marge voor bredere schermen.
 */
const EAGER_PHOTO_COUNT = 8;

type Photo = {
  id: string;
  title: string;
  description?: string;
  width: number;
  height: number;
  thumbnailUrl: string;
  previewUrl: string;
  downloadUrl: string;
  matchScore?: number;
};

type Labels = {
  openPhoto: string;
  close: string;
  previous: string;
  next: string;
  downloadPhoto: string;
  photoCounter: string;
  photo?: string;
} & TakedownLabels;

function isCameraOrCodeTitle(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return true;
  if (/^[\d\s._()-]+$/.test(trimmed)) return true;
  if (
    /^[0-9a-f]{8}[\s-]?[0-9a-f]{4}[\s-]?[0-9a-f]{4}[\s-]?[0-9a-f]{4}[\s-]?[0-9a-f]{12}$/i.test(
      trimmed
    )
  ) {
    return true;
  }
  if (/^[0-9a-f]{24,}$/i.test(trimmed)) return true;
  if (/^WhatsApp\s+(?:Image|Video)\b/i.test(trimmed)) return true;
  if (
    /^(?:IMG|DSC[FN]?|CIMG|DCIM|PXL|MVIMG|MVI|VID|MOV|DJI|GOPR|SAM|CAM|SNAP|FOTO|PHOTO|IMAGE)\b[\s._-]*[A-Z]?\d[\d\sA-Z._()-]*$/i.test(
      trimmed
    )
  ) {
    return true;
  }
  if (/^(?:IMG|DSC[FN]?|PXL|MVIMG)\d[\d\sA-Z._()-]*$/i.test(trimmed)) {
    return true;
  }
  if (/^(?:P\d{7,}|100_\d+|R\d{7,})$/i.test(trimmed)) return true;
  return false;
}

function formatPhotoCounterLabel(
  index: number,
  total: number,
  labels: Pick<Labels, "photo" | "photoCounter">
): string {
  const counter = labels.photoCounter
    .replace("{current}", String(index + 1))
    .replace("{total}", String(total));
  const noun = labels.photo?.trim() || "foto";
  const capitalized = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
  return `${capitalized} ${counter}`;
}

function getPhotoAccessibleName(
  photo: Photo,
  index: number,
  total: number,
  labels: Pick<Labels, "photo" | "photoCounter">,
  albumTitle?: string
): string {
  const description = photo.description?.trim();
  if (description) return description;

  const title = photo.title.trim();
  if (title && !isCameraOrCodeTitle(title)) return title;

  const counterLabel = formatPhotoCounterLabel(index, total, labels);
  const trimmedAlbum = albumTitle?.trim();
  return trimmedAlbum ? `${trimmedAlbum}: ${counterLabel}` : counterLabel;
}

function isOutsideDialog(clientX: number, clientY: number, dialog: HTMLDialogElement) {
  const rect = dialog.getBoundingClientRect();
  return clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom;
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 18h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function AlbumViewer({
  photos,
  labels,
  albumSlug,
  albumTitle,
}: {
  photos: Photo[];
  labels: Labels;
  /**
   * Zonder slug valt niet te zeggen over welk album een verzoek gaat, dus dan
   * verschijnt de meldknop niet. Optioneel, zodat een viewer zonder album
   * (bijvoorbeeld een losse reeks) blijft werken.
   */
  albumSlug?: string;
  albumTitle?: string;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [takedownOpen, setTakedownOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const suppressCloseCountRef = useRef(0);
  const pointerStartX = useRef<number | null>(null);
  const pressedBackdropRef = useRef(false);
  const isOpen = lightboxIndex !== null;
  const activePhoto = lightboxIndex === null ? null : photos[lightboxIndex];

  const photoCounter = useMemo(() => {
    if (lightboxIndex === null) return "";
    return labels.photoCounter
      .replace("{current}", String(lightboxIndex + 1))
      .replace("{total}", String(photos.length));
  }, [labels.photoCounter, lightboxIndex, photos.length]);

  const activePhotoLabel = useMemo(() => {
    if (lightboxIndex === null || !activePhoto) return "";
    return getPhotoAccessibleName(activePhoto, lightboxIndex, photos.length, labels, albumTitle);
  }, [activePhoto, albumTitle, labels, lightboxIndex, photos.length]);

  const move = useCallback((delta: number) => {
    setLightboxIndex((current) => {
      if (current === null || photos.length === 0) return current;
      return (current + delta + photos.length) % photos.length;
    });
  }, [photos.length]);

  const openLightbox = useCallback((index: number, opener: HTMLElement | null) => {
    openerRef.current = opener;
    setTakedownOpen(false);
    setLightboxIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setTakedownOpen(false);
    setLightboxIndex(null);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      wasOpenRef.current = true;
      if (!openerRef.current) {
        openerRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      if (!dialog.open) {
        dialog.showModal();
      }
      if (!dialog.contains(document.activeElement)) {
        closeBtnRef.current?.focus({ preventScroll: true });
      }

      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = previousOverflow;
        if (dialog.open) {
          suppressCloseCountRef.current += 1;
          dialog.close();
        }
        const opener = openerRef.current;
        if (
          opener?.isConnected &&
          (!document.activeElement || document.activeElement === document.body)
        ) {
          opener.focus({ preventScroll: true });
        }
      };
    }

    if (dialog.open) {
      suppressCloseCountRef.current += 1;
      dialog.close();
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener?.isConnected) {
        opener.focus({ preventScroll: true });
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (takedownOpen) return;
      const dialog = dialogRef.current;
      if (dialog?.querySelector("dialog[open]")) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
      }
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeLightbox, isOpen, move, takedownOpen]);

  if (photos.length === 0) return null;

  return (
    <>
      <ul className="vtk-immich-photo-masonry">
        {photos.map((photo, index) => {
          const photoLabel = getPhotoAccessibleName(photo, index, photos.length, labels, albumTitle);
          return (
            <li key={photo.id} className="vtk-immich-photo-tile">
              <button
                type="button"
                className="vtk-immich-photo-button"
                style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
                onClick={(event) => {
                  const opener =
                    document.activeElement instanceof HTMLElement &&
                    document.activeElement !== document.body
                      ? document.activeElement
                      : event.currentTarget;
                  openLightbox(index, opener);
                }}
                aria-label={`${labels.openPhoto}: ${photoLabel}`}
              >
                {/* Immich Public Proxy levert deze duimnagel al op maat, op een aparte
                    host uit GALLERY_PUBLIC_PROXY_URL. Zie next.config.ts: die host past
                    niet in remotePatterns en wordt lokaal door de optimizer geweigerd. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumbnailUrl}
                  alt=""
                  loading={index < EAGER_PHOTO_COUNT ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : "auto"}
                  decoding="async"
                />
              </button>
              <a
                className="vtk-immich-icon-button vtk-immich-photo-download"
                href={photo.downloadUrl}
                title={labels.downloadPhoto}
                aria-label={`${labels.downloadPhoto}: ${photoLabel}`}
                onClick={() => trackPhotoDownload(photo)}
              >
                <DownloadIcon />
              </a>
              {photo.matchScore ? <span className="vtk-immich-match-badge">{photo.matchScore}%</span> : null}
            </li>
          );
        })}
      </ul>

      <dialog
        ref={dialogRef}
        className="vtk-immich-lightbox"
        aria-label={activePhotoLabel || labels.openPhoto}
        {...({ closedby: takedownOpen ? "none" : "any" } as Record<string, string>)}
        onCancel={(event) => {
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          if (takedownOpen || event.currentTarget.querySelector("dialog[open]")) return;
          closeLightbox();
        }}
        onClose={(event) => {
          if (event.target !== event.currentTarget) return;
          if (suppressCloseCountRef.current > 0) {
            suppressCloseCountRef.current -= 1;
            return;
          }
          if (event.currentTarget.open) return;
          closeLightbox();
        }}
        onPointerDown={(event) => {
          if (takedownOpen || event.currentTarget.querySelector("dialog[open]")) {
            pointerStartX.current = null;
            pressedBackdropRef.current = false;
            return;
          }
          pointerStartX.current = event.clientX;
          pressedBackdropRef.current =
            event.target === event.currentTarget &&
            (event.pointerType !== "mouse" || event.button === 0);
        }}
        onPointerUp={(event) => {
          if (takedownOpen || event.currentTarget.querySelector("dialog[open]")) {
            pointerStartX.current = null;
            pressedBackdropRef.current = false;
            return;
          }
          const startX = pointerStartX.current;
          const wasBackdrop = pressedBackdropRef.current;
          pointerStartX.current = null;
          pressedBackdropRef.current = false;

          if (startX !== null) {
            const delta = event.clientX - startX;
            if (Math.abs(delta) >= 44) {
              move(delta > 0 ? -1 : 1);
              return;
            }
          }

          if (
            wasBackdrop &&
            event.target === event.currentTarget &&
            (event.pointerType !== "mouse" || event.button === 0)
          ) {
            if (
              !("closedBy" in HTMLDialogElement.prototype) ||
              !isOutsideDialog(event.clientX, event.clientY, event.currentTarget)
            ) {
              closeLightbox();
            }
          }
        }}
      >
        {activePhoto ? (
          <>
            <div className="vtk-immich-lightbox-bar">
              <span role="status" aria-live="polite" aria-atomic="true">
                {photoCounter}
              </span>
              <div className="vtk-immich-lightbox-actions">
                <a
                  className="vtk-immich-icon-button"
                  href={activePhoto.downloadUrl}
                  title={labels.downloadPhoto}
                  aria-label={`${labels.downloadPhoto}: ${activePhotoLabel}`}
                  onClick={() => trackPhotoDownload(activePhoto)}
                >
                  <DownloadIcon />
                </a>
                {albumSlug ? (
                  <TakedownDialog
                    /* Remount per foto: zo staat het formulier leeg wanneer je
                       doorbladert, zonder een effect dat state reset. */
                    key={activePhoto.id}
                    albumSlug={albumSlug}
                    assetId={activePhoto.id}
                    photoTitle={activePhotoLabel}
                    labels={labels}
                    onOpenChange={setTakedownOpen}
                  />
                ) : null}
                <button
                  ref={closeBtnRef}
                  type="button"
                  className="vtk-immich-icon-button"
                  onClick={closeLightbox}
                  aria-label={labels.close}
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            <button
              type="button"
              className="vtk-immich-lightbox-nav vtk-immich-lightbox-prev"
              onClick={() => move(-1)}
              aria-label={labels.previous}
            >
              ‹
            </button>
            {/* Zelfde reden als de duimnagel hierboven: de preview komt van de
                Immich-proxy, al geschaald, op een host die de optimizer niet kent. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="vtk-immich-lightbox-image"
              src={activePhoto.previewUrl}
              alt={activePhotoLabel}
            />
            <button
              type="button"
              className="vtk-immich-lightbox-nav vtk-immich-lightbox-next"
              onClick={() => move(1)}
              aria-label={labels.next}
            >
              ›
            </button>
          </>
        ) : null}
      </dialog>
    </>
  );
}
