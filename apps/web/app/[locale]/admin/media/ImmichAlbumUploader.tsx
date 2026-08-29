"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@vtk/ui";
import { FileField } from "@/components/ui/FileField";
import {
  createImmichAlbumAction,
  finalizeImmichAlbumAction,
  setImmichAlbumCoverAction,
  uploadImmichAlbumAssetAction,
} from "@/app/actions/media";

type Progress = { total: number; done: number; errors: number };

export function ImmichAlbumUploader({
  locale,
  fakbarEnabled = false,
}: {
  locale: "nl" | "en";
  /**
   * Of de fakbargalerij als bestemming gekozen mag worden. Staat standaard uit;
   * de schakelaar staat op deze pagina en de server hertoetst hem sowieso (zie
   * lib/fakbar-gallery.ts).
   */
  fakbarEnabled?: boolean;
}) {
  const nl = locale === "nl";
  const [gallery, setGallery] = useState<"main" | "fakbar">("main");
  const [files, setFiles] = useState<File[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function selectFiles(list: FileList | null) {
    const next = list ? Array.from(list) : [];
    setFiles(next);
    // Default the cover to the first image in the selection.
    const firstImage = next.findIndex((f) => f.type.startsWith("image/"));
    setCoverIndex(firstImage >= 0 ? firstImage : 0);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    // De bestemming komt uit de state, niet uit een veld dat ook zonder de
    // schakelaar meegestuurd zou kunnen worden.
    data.set("gallery", fakbarEnabled ? gallery : "main");
    if (files.length === 0) {
      setError(nl ? "Kies eerst foto's om te uploaden." : "Pick photos to upload first.");
      return;
    }

    const created = await createImmichAlbumAction(data);
    if (!created.ok || !created.albumId) {
      setError(
        created.error === "missing_title"
          ? nl
            ? "Geef het album een titel."
            : "Give the album a title."
          : created.error === "fakbar_upload_disabled"
            ? nl
              ? "Uploaden naar de fakbargalerij staat uit. Zet het hierboven aan."
              : "Uploading to the fakbar gallery is switched off. Enable it above."
            : nl
              ? "Immich is niet bereikbaar. Probeer later opnieuw."
              : "Immich is unreachable. Try again later."
      );
      return;
    }

    let done = 0;
    let errors = 0;
    const assetIds: Array<string | null> = [];
    setProgress({ total: files.length, done, errors });
    for (const file of files) {
      const uploadData = new FormData();
      uploadData.append("albumId", created.albumId);
      uploadData.append("gallery", data.get("gallery") as string);
      uploadData.append("file", file);
      try {
        const result = await uploadImmichAlbumAssetAction(uploadData);
        assetIds.push(result.ok && result.assetId ? result.assetId : null);
        if (!result.ok) errors += 1;
      } catch {
        assetIds.push(null);
        errors += 1;
      }
      done += 1;
      setProgress({ total: files.length, done, errors });
    }

    // Apply the chosen cover in Immich itself, so the Immich UI and the
    // public gallery both use it. Fall back to the first successful upload.
    const coverAssetId = assetIds[coverIndex] ?? assetIds.find((id) => id !== null) ?? null;
    let coverFailed = false;
    if (coverAssetId) {
      const coverData = new FormData();
      coverData.append("albumId", created.albumId);
      coverData.append("assetId", coverAssetId);
      try {
        const coverResult = await setImmichAlbumCoverAction(coverData);
        coverFailed = !coverResult.ok;
      } catch {
        coverFailed = true;
      }
    }

    const finalizeData = new FormData();
    finalizeData.set("gallery", data.get("gallery") as string);
    await finalizeImmichAlbumAction(finalizeData);
    setProgress(null);
    setFiles([]);
    setCoverIndex(0);
    form.reset();
    const base =
      errors === 0
        ? nl
          ? `Album aangemaakt met ${done} foto's. Het verschijnt binnen een minuut op de mediapagina.`
          : `Album created with ${done} photos. It appears on the media page within a minute.`
        : nl
          ? `Album aangemaakt; ${done - errors}/${done} foto's gelukt (${errors} mislukt).`
          : `Album created; ${done - errors}/${done} photos succeeded (${errors} failed).`;
    setMessage(
      coverFailed
        ? `${base} ${nl ? "De cover kon niet ingesteld worden." : "The cover could not be set."}`
        : base
    );
    startTransition(() => router.refresh());
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <Label>{nl ? "Albumtitel" : "Album title"}</Label>
        <Input name="title" required maxLength={200} />
      </div>
      <div>
        <Label>{nl ? "Beschrijving (optioneel)" : "Description (optional)"}</Label>
        <Input name="description" maxLength={1000} />
      </div>
      {fakbarEnabled ? (
        <div className="md:col-span-2">
          <Label>{nl ? "Naar welke galerij" : "Which gallery"}</Label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="galleryChoice"
                checked={gallery === "main"}
                onChange={() => setGallery("main")}
              />
              <span>{nl ? "Fotogalerij van vtk.be" : "vtk.be photo gallery"}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="galleryChoice"
                checked={gallery === "fakbar"}
                onChange={() => setGallery("fakbar")}
              />
              <span>{nl ? "Fotogalerij van 't ElixIr" : "'t ElixIr photo gallery"}</span>
            </label>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {nl
              ? "Een album staat in één van de twee, nooit in allebei."
              : "An album lives in one of the two, never in both."}
          </p>
        </div>
      ) : null}
      <div className="md:col-span-2">
        <Label>{nl ? "Foto's" : "Photos"}</Label>
        <FileField
          accept="image/*,video/*"
          multiple
          locale={locale}
          chooseLabel={nl ? "Foto's kiezen" : "Choose photos"}
          hint={nl ? "Afbeeldingen en video's." : "Images and videos."}
          onChange={(files) => selectFiles(files)}
        />
      </div>
      {files.length > 0 ? (
        <div className="md:col-span-2">
          <Label>{nl ? "Coverfoto" : "Cover photo"}</Label>
          <p className="mb-1 text-xs text-zinc-500">
            {nl
              ? "Kies welke foto de albumcover wordt (ook zichtbaar in Immich)."
              : "Choose which photo becomes the album cover (also visible in Immich)."}
          </p>
          <ul className="max-h-48 overflow-y-auto rounded-md border border-zinc-200 divide-y divide-zinc-100">
            {files.map((file, index) => {
              const selectable = file.type.startsWith("image/");
              return (
                <li key={`${file.name}-${index}`}>
                  <label className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <input
                      type="radio"
                      name="coverChoice"
                      checked={coverIndex === index}
                      disabled={!selectable}
                      onChange={() => setCoverIndex(index)}
                    />
                    <span className={selectable ? "" : "text-zinc-400"}>
                      {file.name}
                      {!selectable ? (nl ? " (video)" : " (video)") : ""}
                    </span>
                    {coverIndex === index ? (
                      <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold uppercase">
                        Cover
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div className="md:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={Boolean(progress)}>
          {progress
            ? `${progress.done}/${progress.total}${progress.errors ? ` (${progress.errors} err)` : ""}`
            : nl
              ? "Album aanmaken en uploaden"
              : "Create album and upload"}
        </Button>
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </form>
  );
}
