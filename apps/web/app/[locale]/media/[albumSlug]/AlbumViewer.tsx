"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Photo = {
  id: string;
  title: string;
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
};

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

export function AlbumViewer({ photos, labels }: { photos: Photo[]; labels: Labels }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const pointerStartX = useRef<number | null>(null);
  const activePhoto = lightboxIndex === null ? null : photos[lightboxIndex];

  const photoCounter = useMemo(() => {
    if (lightboxIndex === null) return "";
    return labels.photoCounter
      .replace("{current}", String(lightboxIndex + 1))
      .replace("{total}", String(photos.length));
  }, [labels.photoCounter, lightboxIndex, photos.length]);

  const move = useCallback((delta: number) => {
    setLightboxIndex((current) => {
      if (current === null || photos.length === 0) return current;
      return (current + delta + photos.length) % photos.length;
    });
  }, [photos.length]);

  useEffect(() => {
    if (lightboxIndex === null) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLightboxIndex(null);
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [lightboxIndex, move]);

  if (photos.length === 0) return null;

  return (
    <>
      <ul className="vtk-immich-photo-masonry">
        {photos.map((photo, index) => (
          <li key={photo.id} className="vtk-immich-photo-tile">
            <button
              type="button"
              className="vtk-immich-photo-button"
              style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
              onClick={() => setLightboxIndex(index)}
              aria-label={`${labels.openPhoto}: ${photo.title}`}
            >
              <img src={photo.thumbnailUrl} alt={photo.title} loading="lazy" />
            </button>
            <a
              className="vtk-immich-icon-button vtk-immich-photo-download"
              href={photo.downloadUrl}
              title={labels.downloadPhoto}
              aria-label={`${labels.downloadPhoto}: ${photo.title}`}
            >
              <DownloadIcon />
            </a>
            {photo.matchScore ? <span className="vtk-immich-match-badge">{photo.matchScore}%</span> : null}
          </li>
        ))}
      </ul>

      {activePhoto ? (
        <div
          className="vtk-immich-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={activePhoto.title}
          onClick={() => setLightboxIndex(null)}
          onPointerDown={(event) => {
            pointerStartX.current = event.clientX;
          }}
          onPointerUp={(event) => {
            if (pointerStartX.current === null) return;
            const delta = event.clientX - pointerStartX.current;
            pointerStartX.current = null;
            if (Math.abs(delta) < 44) return;
            move(delta > 0 ? -1 : 1);
          }}
        >
          <div className="vtk-immich-lightbox-bar" onClick={(event) => event.stopPropagation()}>
            <span>{photoCounter}</span>
            <div className="vtk-immich-lightbox-actions">
              <a
                className="vtk-immich-icon-button"
                href={activePhoto.downloadUrl}
                title={labels.downloadPhoto}
                aria-label={`${labels.downloadPhoto}: ${activePhoto.title}`}
              >
                <DownloadIcon />
              </a>
              <button
                type="button"
                className="vtk-immich-icon-button"
                onClick={() => setLightboxIndex(null)}
                aria-label={labels.close}
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <button
            type="button"
            className="vtk-immich-lightbox-nav vtk-immich-lightbox-prev"
            onClick={(event) => {
              event.stopPropagation();
              move(-1);
            }}
            aria-label={labels.previous}
          >
            ‹
          </button>
          <img
            className="vtk-immich-lightbox-image"
            src={activePhoto.previewUrl}
            alt={activePhoto.title}
            onClick={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            className="vtk-immich-lightbox-nav vtk-immich-lightbox-next"
            onClick={(event) => {
              event.stopPropagation();
              move(1);
            }}
            aria-label={labels.next}
          >
            ›
          </button>
        </div>
      ) : null}
    </>
  );
}
