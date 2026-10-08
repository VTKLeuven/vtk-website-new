"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { Label } from "@vtk/ui";
import {
  CENTER_FOCUS,
  MAX_IMAGE_ZOOM,
  MIN_IMAGE_ZOOM,
  clampFocusAxis,
  clampImageZoom,
  cropBox,
  fitZoom,
  focusPosition,
  type ImageFocus,
} from "@/lib/imageFocus";

/**
 * Kies welk deel van een foto in beeld blijft.
 *
 * De site toont dezelfde eventfoto in drie verhoudingen, dus dit veld snijdt de
 * foto niet bij maar duidt het punt aan waar elke uitsnede rond draait
 * (`object-position`). Dat heeft twee gevolgen die we bewust willen: de upload
 * blijft ongeschonden, dus het punt is achteraf nog te verleggen zonder de foto
 * opnieuw te kiezen, en een affiche met de tekst bovenaan blijft in álle
 * formaten leesbaar in plaats van in één.
 *
 * Naast het aanduidvlak staan de echte uitsneden van de site. Zonder die
 * voorbeelden is "een punt verslepen" giswerk: je ziet pas na het opslaan wat
 * de homepage ervan maakt.
 *
 * Met `withZoom` komt er een zoom bij (de telefoonuitsnede van een evenement,
 * zie `ImageCrop` in lib/imageFocus.ts), en tekent het aanduidvlak een kader rond
 * wat het eerste voorbeeld toont: bij uitzoomen is dat het enige dat zegt of de
 * logo's aan de rand er nu in vallen.
 */

/** Eén plek op de site waar deze foto verschijnt, met haar verhouding. */
export type FocusPreview = { label: string; ratio: string };

const STEP = 0.02;
/** De verhouding van het aanduidvlak zelf. */
const FRAME_RATIO = 16 / 10;

/** "4 / 3" naar 1,333; onleesbaar wordt null. */
function ratioValue(ratio: string): number | null {
  const [width, height] = ratio.split("/").map((part) => Number(part.trim()));
  return width > 0 && height > 0 ? width / height : null;
}

/**
 * Waar de foto in het aanduidvlak staat, als fracties van dat vlak. Het vlak
 * toont de hele foto (`object-contain`), dus een foto met een andere verhouding
 * krijgt randen; het punt hoort op de foto te liggen en niet op die randen.
 * Zolang de foto niet geladen is, is dat het hele vlak.
 */
function imageBox(imageRatio: number | null) {
  if (!imageRatio) return { x: 0, y: 0, w: 1, h: 1 };
  if (imageRatio >= FRAME_RATIO) {
    const h = FRAME_RATIO / imageRatio;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  const w = imageRatio / FRAME_RATIO;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

/**
 * Het deel van de foto dat een kader met verhouding `frameRatio` toont, als
 * fracties van de foto: met de cover-uitsnede rond `focus`, en `zoom` daar
 * bovenop rond hetzelfde punt (net als `.vtk-event-photo-img` op een telefoon).
 * Kleiner dan 1 gezoomd valt dat deel buiten de foto: daar komt de vervaagde
 * kopie.
 */
function visibleRegion(imageRatio: number, frameRatio: number, focus: ImageFocus, zoom: number) {
  const w = Math.min(1, frameRatio / imageRatio) / zoom;
  const h = Math.min(1, imageRatio / frameRatio) / zoom;
  return { x: focus.x * (1 - w), y: focus.y * (1 - h), w, h };
}

export function ImageFocusField({
  name = "imageFocus",
  imageUrl,
  defaultFocus,
  defaultZoom,
  withZoom = false,
  locale,
  label,
  helpText,
  previews,
  onChange,
}: {
  name?: string;
  /** De foto zelf, of `null` zolang er geen upload is. */
  imageUrl: string | null;
  defaultFocus?: ImageFocus | null;
  /** Enkel met `withZoom`: de zoom waarmee het veld opent; 1 = het kader net gevuld. */
  defaultZoom?: number | null;
  /** Ook een zoom kiezen, die als `${name}Zoom` meegaat. */
  withZoom?: boolean;
  locale: "nl" | "en";
  label?: string;
  helpText?: string;
  previews: FocusPreview[];
  /** Voor een parent die het punt zelf nodig heeft, bv. voor een eigen preview. */
  onChange?: (focus: ImageFocus) => void;
}) {
  const nl = locale === "nl";
  const [focus, setFocusState] = useState<ImageFocus>(defaultFocus ?? CENTER_FOCUS);
  const [zoom, setZoom] = useState(withZoom ? clampImageZoom(defaultZoom) : 1);
  const [dragging, setDragging] = useState(false);
  // De verhouding van de foto, zodra ze geladen is. Per adres bijgehouden, zodat
  // een nieuwe upload niet even met de verhouding van de vorige rekent.
  const [loaded, setLoaded] = useState<{ url: string; ratio: number } | null>(null);
  const imageRatio = loaded && loaded.url === imageUrl ? loaded.ratio : null;
  const frameRef = useRef<HTMLDivElement>(null);

  // Eén doorgang voor elke wijziging, zodat `onChange` niet aan één van de drie
  // manieren om het punt te verzetten kan ontbreken.
  const setFocus = useCallback(
    (next: ImageFocus) => {
      setFocusState(next);
      onChange?.(next);
    },
    [onChange],
  );

  const box = imageBox(imageRatio);

  // Het punt volgt de cursor binnen de foto; erbuiten plakt het aan de rand,
  // zodat een sleep die per ongeluk over de rand gaat niet terugspringt.
  function pointFromEvent(event: { clientX: number; clientY: number }) {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    setFocus({
      x: clampFocusAxis(((event.clientX - rect.left) / rect.width - box.x) / box.w),
      y: clampFocusAxis(((event.clientY - rect.top) / rect.height - box.y) / box.h),
    });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const dx = event.key === "ArrowLeft" ? -STEP : event.key === "ArrowRight" ? STEP : 0;
    const dy = event.key === "ArrowUp" ? -STEP : event.key === "ArrowDown" ? STEP : 0;
    if (dx === 0 && dy === 0) return;
    event.preventDefault();
    setFocus({ x: clampFocusAxis(focus.x + dx), y: clampFocusAxis(focus.y + dy) });
  }

  const position = focusPosition(focus);
  const centered = Math.abs(focus.x - 0.5) < 0.005 && Math.abs(focus.y - 0.5) < 0.005;
  const firstRatio = previews[0] ? ratioValue(previews[0].ratio) : null;
  const fit = withZoom && imageRatio && firstRatio ? fitZoom(imageRatio, firstRatio) : null;
  const region =
    withZoom && imageRatio && firstRatio ? visibleRegion(imageRatio, firstRatio, focus, zoom) : null;
  // Met een zoom staat de foto in elk voorbeeld op de maat die `cropBox`
  // uitrekent, net als op de eventpagina zelf. Een `transform` op een
  // cover-foto zou enkel verkleinen wat er al overbleef, en dus niets van de
  // randen terugbrengen.
  function previewBox(ratio: string): React.CSSProperties {
    const frameRatio = ratioValue(ratio);
    if (!withZoom || !imageRatio || !frameRatio) return { inset: 0 };
    const crop = cropBox(imageRatio, frameRatio, focus, zoom);
    return { left: `${crop.left}%`, top: `${crop.top}%`, width: `${crop.width}%`, height: `${crop.height}%` };
  }

  return (
    <div>
      <Label>{label ?? (nl ? "Uitsnede" : "Crop")}</Label>
      <input type="hidden" name={`${name}X`} value={focus.x.toFixed(4)} />
      <input type="hidden" name={`${name}Y`} value={focus.y.toFixed(4)} />
      {withZoom ? (
        <>
          <input type="hidden" name={`${name}Zoom`} value={zoom.toFixed(2)} />
          {/* De verhouding van de foto: de pagina heeft ze nodig om uit te
              zoomen (zie `ImageCrop`). Leeg zolang de foto niet geladen is. */}
          <input type="hidden" name={`${name}Ratio`} value={imageRatio ? imageRatio.toFixed(4) : ""} />
        </>
      ) : null}

      {imageUrl === null ? (
        <p className="text-xs text-[#5c667f]">
          {nl
            ? "Kies eerst een foto; daarna kan je hier aanduiden welk deel in beeld blijft."
            : "Choose a photo first; then you can point out here which part stays in view."}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            {/* De volledige foto, niets afgesneden: hier duid je aan, hiernaast
                zie je wat de site ervan overhoudt. */}
            <div
              ref={frameRef}
              role="group"
              aria-label={nl ? "Middelpunt van de uitsnede" : "Centre of the crop"}
              className={`relative w-full max-w-md shrink-0 overflow-hidden rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft ${
                dragging ? "cursor-grabbing" : "cursor-crosshair"
              }`}
              style={{ aspectRatio: "16 / 10" }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(true);
                pointFromEvent(event);
              }}
              onPointerMove={(event) => {
                if (dragging) pointFromEvent(event);
              }}
              onPointerUp={(event) => {
                event.currentTarget.releasePointerCapture(event.pointerId);
                setDragging(false);
              }}
              onPointerCancel={() => setDragging(false)}
            >
              <Image
                src={imageUrl}
                alt=""
                fill
                sizes="448px"
                className="pointer-events-none touch-none select-none object-contain"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                    setLoaded({ url: imageUrl, ratio: image.naturalWidth / image.naturalHeight });
                  }
                }}
              />
              {/* Wat het eerste voorbeeld (de telefoon) toont. Uitgezoomd steekt
                  het buiten de foto: dat stuk vult de site met een vervaagde
                  kopie. */}
              {region ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute rounded-sm border-2 border-white shadow-[0_0_0_1px_rgba(10,15,31,.45),0_0_0_9999px_rgba(10,15,31,.28)]"
                  style={{
                    left: `${(box.x + region.x * box.w) * 100}%`,
                    top: `${(box.y + region.y * box.h) * 100}%`,
                    width: `${region.w * box.w * 100}%`,
                    height: `${region.h * box.h * 100}%`,
                  }}
                />
              ) : null}
              <button
                type="button"
                onKeyDown={onKeyDown}
                aria-label={
                  nl
                    ? `Middelpunt van de uitsnede, nu op ${position}. Versleep of gebruik de pijltjestoetsen.`
                    : `Centre of the crop, currently at ${position}. Drag it or use the arrow keys.`
                }
                className="absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white bg-vtk-ink/80 shadow-[0_0_0_1px_rgba(10,15,31,.35)] outline-offset-2"
                style={{
                  left: `${(box.x + focus.x * box.w) * 100}%`,
                  top: `${(box.y + focus.y * box.h) * 100}%`,
                }}
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#5c667f]">
                {nl ? "Zo verschijnt ze op de site" : "This is how it appears on the site"}
              </p>
              <div className="flex flex-wrap gap-3">
                {previews.map((preview) => (
                  <figure key={preview.label} className="m-0 w-36">
                    <div
                      className="relative overflow-hidden rounded-lg border border-vtk-blue/15 bg-vtk-blue-soft"
                      style={{ aspectRatio: preview.ratio }}
                    >
                      {withZoom && zoom < 1 ? (
                        <Image
                          src={imageUrl}
                          alt=""
                          aria-hidden="true"
                          fill
                          sizes="144px"
                          className="scale-125 object-cover blur-md"
                        />
                      ) : null}
                      {/* Een laag op de maat van `cropBox`; `next/image` met
                          `fill` laat zijn eigen breedte niet aanpassen. */}
                      <div className="absolute" style={previewBox(preview.ratio)}>
                        <Image
                          src={imageUrl}
                          alt=""
                          fill
                          sizes="144px"
                          className="object-cover"
                          style={{ objectPosition: position }}
                        />
                      </div>
                    </div>
                    <figcaption className="mt-1 text-[11px] text-[#5c667f]">
                      {preview.label}
                    </figcaption>
                  </figure>
                ))}
              </div>

              {withZoom ? (
                <div className="mt-4 max-w-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <label
                      htmlFor={`${name}-zoom`}
                      className="text-xs font-medium uppercase tracking-wide text-[#5c667f]"
                    >
                      Zoom
                    </label>
                    <output htmlFor={`${name}-zoom`} className="text-sm font-semibold tabular-nums text-vtk-ink">
                      {Math.round(zoom * 100)}%
                    </output>
                  </div>
                  <input
                    id={`${name}-zoom`}
                    type="range"
                    min={MIN_IMAGE_ZOOM}
                    max={MAX_IMAGE_ZOOM}
                    step={0.01}
                    value={zoom}
                    onChange={(event) => setZoom(clampImageZoom(event.target.value))}
                    className="w-full accent-vtk-navy"
                  />
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {fit !== null && fit < 1 ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-vtk-ink underline underline-offset-2"
                        onClick={() => setZoom(fit)}
                      >
                        {nl ? "Hele foto in beeld" : "Whole photo in view"}
                      </button>
                    ) : null}
                    {zoom !== 1 ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-vtk-ink underline underline-offset-2"
                        onClick={() => setZoom(1)}
                      >
                        {nl ? "Kader net gevuld (100%)" : "Frame just filled (100%)"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {helpText ? <p className="text-xs text-[#5c667f]">{helpText}</p> : null}
            {!centered ? (
              <button
                type="button"
                className="text-xs font-medium text-vtk-ink underline underline-offset-2"
                onClick={() => setFocus(CENTER_FOCUS)}
              >
                {nl ? "Terug naar het midden" : "Back to the centre"}
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
