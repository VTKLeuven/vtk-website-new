"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "@vtk/i18n";
import type { GalleryPhoto } from "@/lib/gallery";

import "@/app/design/vtk-gallery.css";

/**
 * Een reeks foto's in de tekst van een pagina: een uitgevulde strook waarin elke
 * foto haar eigen verhouding houdt.
 *
 * De rijen worden hier verdeeld, de breedtes komen uit de flexbox: elke foto
 * groeit naar verhouding van haar beeldverhouding (`--ar`), waardoor alle foto's
 * op één rij vanzelf even hoog worden en de rij precies de kolom vult zonder dat
 * er iets bijgesneden wordt. Het afbreken aan `flex-wrap` overlaten gaf halve
 * rijen: die breekt af zodra de basisbreedtes niet meer passen, dus twee foto's
 * die samen nog net pasten, groeiden daarna uit tot een halve schermhoogte.
 *
 * Kent één foto haar maten niet (oudere pagina's, van voor de uploadroute ze
 * meeschreef), dan valt de hele reeks terug op een raster met een vaste
 * uitsnede: dat staat er meteen goed, terwijl een strook pas na het laden van de
 * laatste foto haar plaats zou vinden.
 *
 * Klikken opent het vergrootglas. Dat staat in een portal op `document.body`:
 * `.vtk-page-body` is een containerquery-container en dus het referentiekader
 * voor alles wat `position: fixed` is, waardoor de overlay anders enkel de
 * tekstkolom zou bedekken en zou meescrollen.
 */
/**
 * Hoeveel beeldbreedte er op een rij past, in verhoudingen opgeteld: ongeveer
 * twee en een halve liggende foto. Dat is geen breedte in pixels omdat de rij
 * even breed is als de kolom waarin ze staat; wat je hier kiest, is dus hoe hoog
 * een rij uitkomt (kolom gedeeld door dit getal).
 */
const ROW_ASPECT = 3.65;

/** De verhouding van een foto waarvan de maten bekend zijn. */
function ratio(photo: GalleryPhoto): number {
  return (photo.width ?? 3) / (photo.height ?? 2);
}

/**
 * Verdeelt de foto's over rijen die ongeveer evenveel beeldbreedte dragen, zodat
 * ze ook ongeveer even hoog uitkomen. Eerst het aantal rijen kiezen en dan
 * verdelen (in plaats van vullen tot het vol is) voorkomt een laatste rij met
 * één foto erin, die anders over de volle breedte zou uitrekken.
 */
function toRows(photos: GalleryPhoto[]): GalleryPhoto[][] {
  const total = photos.reduce((sum, photo) => sum + ratio(photo), 0);
  const count = Math.max(1, Math.round(total / ROW_ASPECT));
  const perRow = total / count;

  const rows: GalleryPhoto[][] = [];
  let current: GalleryPhoto[] = [];
  let sum = 0;
  for (const photo of photos) {
    current.push(photo);
    sum += ratio(photo);
    if (sum >= perRow - 0.001 && rows.length < count - 1) {
      rows.push(current);
      current = [];
      sum = 0;
    }
  }
  if (current.length > 0) rows.push(current);

  return rows;
}

export function PageGallery({
  photos,
  locale = DEFAULT_LOCALE,
}: {
  photos: GalleryPhoto[];
  locale?: Locale;
}) {
  const t = getDictionary(locale).photos;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const pointerStartX = useRef<number | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const move = useCallback(
    (delta: number) => {
      setOpenIndex((current) =>
        current === null ? current : (current + delta + photos.length) % photos.length
      );
    },
    [photos.length]
  );

  const close = useCallback(() => {
    setOpenIndex(null);
    openerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (openIndex === null) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
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
  }, [close, move, openIndex]);

  if (photos.length === 0) return null;

  const sized = photos.every((photo) => photo.width !== null && photo.height !== null);
  // Zonder maten valt er niets te verdelen: dan is het één raster met vaste
  // cellen, en staat elke foto in haar eigen cel.
  const rows = sized ? toRows(photos) : [photos];
  const active = openIndex === null ? null : photos[openIndex];

  function counter(index: number) {
    return t.photoCounter
      .replace("{current}", String(index + 1))
      .replace("{total}", String(photos.length));
  }

  return (
    <>
      <div
        className={`vtk-gal ${sized ? "is-strip" : "is-grid"}`}
        style={
          {
            "--cols": Math.min(photos.length, 4),
            "--cols-narrow": Math.min(photos.length, 2),
          } as CSSProperties
        }
      >
        {rows.map((row, rowIndex) => (
          <div className="vtk-gal-row" key={rowIndex}>
            {row.map((photo) => {
              const index = photos.indexOf(photo);
              return (
                <button
                  key={`${photo.src}-${index}`}
                  type="button"
                  className="vtk-gal-item"
                  style={sized ? ({ "--ar": ratio(photo) } as CSSProperties) : undefined}
                  onClick={(event) => {
                    openerRef.current = event.currentTarget;
                    setOpenIndex(index);
                  }}
                  aria-label={`${t.openPhoto}: ${photo.alt || counter(index)}`}
                >
                  {/* De mediaroute levert het bestand zoals het geüpload is; de
                      optimizer van next/image kent deze maten niet op voorhand. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    width={photo.width ?? undefined}
                    height={photo.height ?? undefined}
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* `document` bestaat hier altijd: het paneel gaat pas open na een klik, dus
          bij het renderen op de server is `active` nog null. */}
      {active
        ? createPortal(
            <div
              className="vtk-gal-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={active.alt || counter(openIndex as number)}
              onClick={close}
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
              <div className="vtk-gal-lightbox-bar" onClick={(event) => event.stopPropagation()}>
                <span>{counter(openIndex as number)}</span>
                <button type="button" onClick={close} aria-label={t.close}>
                  {t.close}
                </button>
              </div>

              {photos.length > 1 ? (
                <button
                  type="button"
                  className="vtk-gal-lightbox-nav prev"
                  onClick={(event) => {
                    event.stopPropagation();
                    move(-1);
                  }}
                  aria-label={t.previousPhoto}
                >
                  ‹
                </button>
              ) : null}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="vtk-gal-lightbox-image"
                src={active.src}
                alt={active.alt}
                onClick={(event) => event.stopPropagation()}
              />

              {photos.length > 1 ? (
                <button
                  type="button"
                  className="vtk-gal-lightbox-nav next"
                  onClick={(event) => {
                    event.stopPropagation();
                    move(1);
                  }}
                  aria-label={t.nextPhoto}
                >
                  ›
                </button>
              ) : null}

              {active.alt ? (
                <p className="vtk-gal-lightbox-caption" onClick={(event) => event.stopPropagation()}>
                  {active.alt}
                </p>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
