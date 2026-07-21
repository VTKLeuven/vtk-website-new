"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@vtk/ui";

type Crop = { zoom: number; x: number; y: number };

function drawSquareCrop(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  crop: Crop,
  outputSize: number,
) {
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CANVAS_UNAVAILABLE");

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const sourceSize = Math.min(width, height) / crop.zoom;
  const centeredX = (width - sourceSize) / 2;
  const centeredY = (height - sourceSize) / 2;
  const sourceX = centeredX + crop.x * centeredX;
  const sourceY = centeredY + crop.y * centeredY;

  context.clearRect(0, 0, outputSize, outputSize);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    outputSize,
    outputSize,
  );
}

export function AvatarCropField({
  locale,
  currentAvatar,
}: {
  locale: "nl" | "en";
  currentAvatar: string | null;
}) {
  const nl = locale === "nl";
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const committedFileRef = useRef<File | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [cropReady, setCropReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentAvatar);
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);

  const redraw = useCallback(() => {
    if (!canvasRef.current || !imageRef.current) return;
    drawSquareCrop(canvasRef.current, imageRef.current, crop, 320);
  }, [crop]);

  useEffect(() => {
    if (editorOpen) redraw();
  }, [editorOpen, redraw]);

  useEffect(
    () => () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  function resetPendingSelection() {
    setEditorOpen(false);
    imageRef.current = null;
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = null;
    if (inputRef.current) {
      if (committedFileRef.current) {
        const transfer = new DataTransfer();
        transfer.items.add(committedFileRef.current);
        inputRef.current.files = transfer.files;
        setCropReady(true);
      } else {
        inputRef.current.value = "";
        setCropReady(false);
      }
    }
  }

  function chooseFile(file: File | undefined) {
    setError(null);
    setCropReady(false);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(nl ? "Kies een geldig afbeeldingsbestand." : "Choose a valid image file.");
      resetPendingSelection();
      return;
    }

    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    const sourceUrl = URL.createObjectURL(file);
    sourceUrlRef.current = sourceUrl;
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setCrop({ zoom: 1, x: 0, y: 0 });
      setEditorOpen(true);
      requestAnimationFrame(redraw);
    };
    image.onerror = () => {
      setError(nl ? "Deze afbeelding kon niet worden geopend." : "This image could not be opened.");
      resetPendingSelection();
    };
    image.src = sourceUrl;
  }

  async function confirmCrop() {
    const image = imageRef.current;
    const input = inputRef.current;
    if (!image || !input) return;

    const output = document.createElement("canvas");
    drawSquareCrop(output, image, crop, 512);
    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) {
      setError(nl ? "De uitsnede kon niet worden gemaakt." : "The crop could not be created.");
      return;
    }

    const file = new File([blob], "profile-photo.jpg", { type: "image/jpeg" });
    committedFileRef.current = file;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextPreview = URL.createObjectURL(blob);
    previewUrlRef.current = nextPreview;
    setPreviewUrl(nextPreview);
    setCropReady(true);
    setEditorOpen(false);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[16px] border border-vtk-blue/10 bg-vtk-blue-soft">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            name={cropReady ? "photo" : undefined}
            accept="image/*"
            onChange={(event) => chooseFile(event.currentTarget.files?.[0])}
            className="block max-w-full text-sm text-[#34405e] file:mr-3 file:rounded-full file:border-0 file:bg-vtk-ink file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
          />
          {cropReady ? (
            <p className="text-xs font-medium text-emerald-700">
              {nl ? "Uitsnede klaar om op te slaan." : "Crop ready to save."}
            </p>
          ) : null}
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
        </div>
      </div>

      {editorOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-vtk-ink/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="avatar-crop-title"
        >
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <h3 id="avatar-crop-title" className="text-lg font-semibold text-vtk-ink">
              {nl ? "Profielfoto uitsnijden" : "Crop profile photo"}
            </h3>
            <p className="mt-1 text-sm text-[#5c667f]">
              {nl
                ? "Pas de uitsnede aan. Alleen dit vierkant wordt geüpload."
                : "Adjust the crop. Only this square will be uploaded."}
            </p>

            <canvas
              ref={canvasRef}
              className="mx-auto mt-4 aspect-square w-full max-w-80 rounded-2xl bg-vtk-blue-soft object-contain"
              aria-label={nl ? "Voorbeeld van de uitsnede" : "Crop preview"}
            />

            <div className="mt-5 space-y-3">
              <label className="block text-sm font-medium text-vtk-ink">
                {nl ? "Zoom" : "Zoom"}
                <input
                  className="mt-1 block w-full accent-vtk-ink"
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={crop.zoom}
                  onChange={(event) => setCrop((value) => ({ ...value, zoom: Number(event.target.value) }))}
                />
              </label>
              <label className="block text-sm font-medium text-vtk-ink">
                {nl ? "Horizontale positie" : "Horizontal position"}
                <input
                  className="mt-1 block w-full accent-vtk-ink"
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  value={crop.x}
                  onChange={(event) => setCrop((value) => ({ ...value, x: Number(event.target.value) }))}
                />
              </label>
              <label className="block text-sm font-medium text-vtk-ink">
                {nl ? "Verticale positie" : "Vertical position"}
                <input
                  className="mt-1 block w-full accent-vtk-ink"
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  value={crop.y}
                  onChange={(event) => setCrop((value) => ({ ...value, y: Number(event.target.value) }))}
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={resetPendingSelection}>
                {nl ? "Annuleren" : "Cancel"}
              </Button>
              <Button type="button" onClick={confirmCrop}>
                {nl ? "Uitsnede gebruiken" : "Use crop"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
