'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@vtk/ui';

/**
 * Het thumbnailgedeelte van een foto kiezen (M6).
 *
 * De catalogus toont elke foto in 4:3 met `object-cover`, dus een staande foto
 * van een boormachine werd bovenaan en onderaan afgesneden op een plek die
 * niemand koos. Hier schuif en zoom je tot het juiste stuk in het kader staat.
 *
 * **De originele foto blijft bestaan.** Het bijgesneden beeld wordt een nieuwe
 * upload die de thumbnail wordt; op de detailpagina hoort de hele foto te
 * staan, en die zou anders onherstelbaar weg zijn.
 *
 * Met de canvas van de browser en geen bibliotheek: een extra afhankelijkheid
 * kost hier een volledige lockfile-regeneratie (zie AGENTS.md) voor iets wat in
 * dertig regels past.
 */
const OUTPUT_WIDTH = 1000;
const OUTPUT_HEIGHT = 750;
const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;

export function PhotoCropper({
  src,
  onCancel,
  onCropped,
}: {
  src: string;
  onCancel: () => void;
  /** De bijgesneden foto als bestand, klaar om te uploaden. */
  onCropped: (file: File) => void;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // De schaal waarbij de foto het kader net vult; alles daarboven is inzoomen.
  const baseScale = loaded
    ? Math.max(FRAME_WIDTH / loaded.width, FRAME_HEIGHT / loaded.height)
    : 1;
  const scale = baseScale * zoom;
  const drawnWidth = (loaded?.width ?? 0) * scale;
  const drawnHeight = (loaded?.height ?? 0) * scale;

  /** Nooit een rand buiten de foto: het kader moet altijd gevuld blijven. */
  function clamp(next: { x: number; y: number }) {
    const maxX = Math.max(0, (drawnWidth - FRAME_WIDTH) / 2);
    const maxY = Math.max(0, (drawnHeight - FRAME_HEIGHT) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }

  function crop() {
    const image = imageRef.current;
    if (!image || !loaded) return;
    setBusy(true);
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_WIDTH;
    canvas.height = OUTPUT_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) {
      setBusy(false);
      return;
    }
    // Van kaderpixels naar bronpixels: het midden van het kader ligt op het
    // midden van de foto, verschoven met `offset`.
    const sourceWidth = FRAME_WIDTH / scale;
    const sourceHeight = FRAME_HEIGHT / scale;
    const sourceX = (loaded.width - sourceWidth) / 2 - offset.x / scale;
    const sourceY = (loaded.height - sourceHeight) / 2 - offset.y / scale;
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      OUTPUT_WIDTH,
      OUTPUT_HEIGHT
    );
    canvas.toBlob(
      (blob) => {
        setBusy(false);
        if (!blob) return;
        onCropped(new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-vtk-ink/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Thumbnail bijsnijden"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-[18px] border border-vtk-navy/15 bg-vtk-surface p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-vtk-ink">Thumbnail bijsnijden</h2>
        <p className="mt-1 text-xs text-vtk-muted">
          Sleep de foto en zoom tot het juiste stuk in het kader staat. De originele foto blijft
          bewaard voor de detailpagina.
        </p>

        <div
          className="mx-auto mt-4 cursor-grab overflow-hidden rounded-[12px] border border-vtk-navy/15 bg-vtk-paper-2 active:cursor-grabbing"
          style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT }}
          onPointerDown={(event) => {
            dragging.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!dragging.current) return;
            setOffset(
              clamp({ x: event.clientX - dragging.current.x, y: event.clientY - dragging.current.y })
            );
          }}
          onPointerUp={() => {
            dragging.current = null;
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={(event) => {
              const target = event.currentTarget;
              setLoaded({ width: target.naturalWidth, height: target.naturalHeight });
              setOffset({ x: 0, y: 0 });
              setZoom(1);
            }}
            style={{
              width: drawnWidth || undefined,
              height: drawnHeight || undefined,
              transform: `translate(${offset.x}px, ${offset.y}px)`,
              maxWidth: 'none',
              // Het kader is het referentiepunt: de foto zit gecentreerd en
              // schuift van daaruit.
              marginLeft: drawnWidth ? (FRAME_WIDTH - drawnWidth) / 2 : 0,
              marginTop: drawnHeight ? (FRAME_HEIGHT - drawnHeight) / 2 : 0,
            }}
          />
        </div>

        <label className="mt-3 grid gap-1 text-xs font-medium text-vtk-muted">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(event) => {
              setZoom(Number(event.target.value));
              setOffset((current) => clamp(current));
            }}
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={crop} disabled={busy || !loaded}>
            {busy ? 'Bijsnijden…' : 'Als thumbnail gebruiken'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Annuleren
          </Button>
        </div>
      </div>
    </div>
  );
}
