'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ElixirIcon } from '@/components/elixir-icon';
import { TakedownDialog } from './takedown-dialog';

type Photo = {
  id: string;
  title: string;
  width: number;
  height: number;
  thumbnailUrl: string;
  previewUrl: string;
  downloadUrl: string;
};

/**
 * Het raster met de lightbox. Zelfde gedrag als de albumviewer op vtk.be
 * (pijltjes, Escape, vegen op mobiel, downloadknop per foto), in de vormtaal
 * van deze app.
 *
 * De afbeeldingen komen van de Immich-proxy op een eigen host, al op maat
 * geschaald; daarom gewone `<img>`-tags en geen `next/image`.
 */
export function AlbumViewer({ photos, albumSlug }: { photos: Photo[]; albumSlug: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const pointerStartX = useRef<number | null>(null);
  const active = index === null ? null : photos[index];

  const move = useCallback(
    (delta: number) => {
      setIndex((current) => {
        if (current === null || photos.length === 0) return current;
        return (current + delta + photos.length) % photos.length;
      });
    },
    [photos.length],
  );

  useEffect(() => {
    if (index === null) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIndex(null);
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    }

    // De pagina eronder mag niet meescrollen zolang de lightbox openstaat.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [index, move]);

  const counter = useMemo(
    () => (index === null ? '' : `${index + 1} van ${photos.length}`),
    [index, photos.length],
  );

  if (photos.length === 0) return null;

  return (
    <>
      <ul className="fakbar-photo-grid">
        {photos.map((photo, photoIndex) => (
          <li key={photo.id} className="fakbar-photo-tile">
            <button
              type="button"
              className="fakbar-photo-button"
              style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
              onClick={() => setIndex(photoIndex)}
              aria-label={`Foto openen: ${photo.title}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.thumbnailUrl} alt={photo.title} loading="lazy" />
            </button>
            <a
              className="fakbar-photo-download"
              href={photo.downloadUrl}
              title="Downloaden"
              aria-label={`Downloaden: ${photo.title}`}
            >
              <ElixirIcon name="arrow" className="h-4 w-4 rotate-90" />
            </a>
          </li>
        ))}
      </ul>

      {active ? (
        <div
          className="fakbar-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={active.title}
          onClick={() => setIndex(null)}
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
          <div className="fakbar-lightbox-bar" onClick={(event) => event.stopPropagation()}>
            <span>{counter}</span>
            <div className="fakbar-lightbox-actions">
              <a
                className="fakbar-lightbox-button"
                href={active.downloadUrl}
                title="Downloaden"
                aria-label={`Downloaden: ${active.title}`}
              >
                <ElixirIcon name="arrow" className="h-[1.05rem] w-[1.05rem] rotate-90" />
              </a>
              {/* Remount per foto: zo staat het formulier leeg wanneer je doorbladert. */}
              <TakedownDialog
                key={active.id}
                albumSlug={albumSlug}
                assetId={active.id}
                photoTitle={active.title}
              />
              <button
                type="button"
                className="fakbar-lightbox-button"
                onClick={() => setIndex(null)}
                aria-label="Sluiten"
              >
                <span aria-hidden className="text-lg leading-none">
                  &times;
                </span>
              </button>
            </div>
          </div>

          <button
            type="button"
            className="fakbar-lightbox-nav fakbar-lightbox-prev"
            onClick={(event) => {
              event.stopPropagation();
              move(-1);
            }}
            aria-label="Vorige foto"
          >
            &lsaquo;
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="fakbar-lightbox-image"
            src={active.previewUrl}
            alt={active.title}
            onClick={(event) => event.stopPropagation()}
          />

          <button
            type="button"
            className="fakbar-lightbox-nav fakbar-lightbox-next"
            onClick={(event) => {
              event.stopPropagation();
              move(1);
            }}
            aria-label="Volgende foto"
          >
            &rsaquo;
          </button>
        </div>
      ) : null}
    </>
  );
}
