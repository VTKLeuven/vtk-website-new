"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { Label } from "@vtk/ui";
import {
  CENTER_FOCUS,
  clampFocusAxis,
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
 */

/** Eén plek op de site waar deze foto verschijnt, met haar verhouding. */
export type FocusPreview = { label: string; ratio: string };

const STEP = 0.02;

export function ImageFocusField({
  name = "imageFocus",
  imageUrl,
  defaultFocus,
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
  locale: "nl" | "en";
  label?: string;
  helpText?: string;
  previews: FocusPreview[];
  /** Voor een parent die het punt zelf nodig heeft, bv. voor een eigen preview. */
  onChange?: (focus: ImageFocus) => void;
}) {
  const nl = locale === "nl";
  const [focus, setFocusState] = useState<ImageFocus>(defaultFocus ?? CENTER_FOCUS);
  const [dragging, setDragging] = useState(false);
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

  // Het punt volgt de cursor binnen het kader; buiten het kader plakt het aan de
  // rand, zodat een sleep die per ongeluk over de rand gaat niet terugspringt.
  function pointFromEvent(event: { clientX: number; clientY: number }) {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    setFocus({
      x: clampFocusAxis((event.clientX - rect.left) / rect.width),
      y: clampFocusAxis((event.clientY - rect.top) / rect.height),
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

  return (
    <div>
      <Label>{label ?? (nl ? "Uitsnede" : "Crop")}</Label>
      <input type="hidden" name={`${name}X`} value={focus.x.toFixed(4)} />
      <input type="hidden" name={`${name}Y`} value={focus.y.toFixed(4)} />

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
              />
              <button
                type="button"
                onKeyDown={onKeyDown}
                aria-label={
                  nl
                    ? `Middelpunt van de uitsnede, nu op ${position}. Versleep of gebruik de pijltjestoetsen.`
                    : `Centre of the crop, currently at ${position}. Drag it or use the arrow keys.`
                }
                className="absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white bg-vtk-ink/80 shadow-[0_0_0_1px_rgba(10,15,31,.35)] outline-offset-2"
                style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }}
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
                      <Image
                        src={imageUrl}
                        alt=""
                        fill
                        sizes="144px"
                        className="object-cover"
                        style={{ objectPosition: position }}
                      />
                    </div>
                    <figcaption className="mt-1 text-[11px] text-[#5c667f]">
                      {preview.label}
                    </figcaption>
                  </figure>
                ))}
              </div>
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
