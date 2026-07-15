"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Textarea } from "@vtk/ui";
import {
  createImmichAlbumAction,
  finalizeImmichAlbumAction,
  uploadImmichAlbumAssetAction,
} from "@/app/actions/media";

type Progress = { total: number; done: number; errors: number };

export function ImmichAlbumUploader({ locale }: { locale: "nl" | "en" }) {
  const nl = locale === "nl";
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const form = event.currentTarget;
    const data = new FormData(form);
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
          : nl
            ? "Immich is niet bereikbaar. Probeer later opnieuw."
            : "Immich is unreachable. Try again later."
      );
      return;
    }

    let done = 0;
    let errors = 0;
    setProgress({ total: files.length, done, errors });
    for (const file of files) {
      const uploadData = new FormData();
      uploadData.append("albumId", created.albumId);
      uploadData.append("file", file);
      try {
        const result = await uploadImmichAlbumAssetAction(uploadData);
        if (!result.ok) errors += 1;
      } catch {
        errors += 1;
      }
      done += 1;
      setProgress({ total: files.length, done, errors });
    }

    await finalizeImmichAlbumAction();
    setProgress(null);
    setFiles([]);
    form.reset();
    setMessage(
      errors === 0
        ? nl
          ? `Album aangemaakt met ${done} foto's. Het verschijnt binnen een minuut op de mediapagina.`
          : `Album created with ${done} photos. It appears on the media page within a minute.`
        : nl
          ? `Album aangemaakt; ${done - errors}/${done} foto's gelukt (${errors} mislukt).`
          : `Album created; ${done - errors}/${done} photos succeeded (${errors} failed).`
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
      <div className="md:col-span-2">
        <Label>{nl ? "Foto's" : "Photos"}</Label>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          className="block w-full text-sm"
          onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
        />
        {files.length > 0 ? (
          <p className="mt-1 text-xs text-zinc-500">
            {files.length} {nl ? "bestanden geselecteerd" : "files selected"}
          </p>
        ) : null}
      </div>
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
