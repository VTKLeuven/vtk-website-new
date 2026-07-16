"use client";

import { useState } from "react";
import { Label } from "@vtk/ui";

/**
 * Bouwt de same-origin media-URL client-side. `publicUrl` uit `lib/storage`
 * doet hetzelfde, maar dat bestand her-exporteert heel `@vtk/storage`
 * (aws-sdk, node) en hoort dus niet in een client-bundel.
 */
function mediaUrl(key: string): string {
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Optionele cover-afbeelding voor een evenement. Uploadt naar de gedeelde
 * `/api/admin/upload`-route (die de foto naar JPEG hercodeert) en houdt enkel de
 * storage-key bij in een verborgen veld; `saveEventAction` bewaart die. Zonder
 * afbeelding valt de eventpagina terug op de standaardfoto.
 */
export function EventImageField({
  defaultKey,
  locale,
}: {
  defaultKey?: string | null;
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  const [key, setKey] = useState(defaultKey ?? "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    defaultKey ? mediaUrl(defaultKey) : null,
  );
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(file: File) {
    setErr(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "image");
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      if (!res.ok) {
        setErr(nl ? "Upload mislukt" : "Upload failed");
        return;
      }
      const data = (await res.json()) as { key: string; url: string | null };
      setKey(data.key);
      setPreviewUrl(data.url ?? mediaUrl(data.key));
    } catch {
      setErr(nl ? "Upload mislukt" : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <Label>{nl ? "Afbeelding" : "Image"}</Label>
      <input type="hidden" name="imageKey" value={key} />
      <div className="flex items-center gap-4">
        <div className="grid aspect-[16/10] w-40 shrink-0 place-items-center overflow-hidden rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/40">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="px-2 text-center text-xs text-zinc-400">
              {nl ? "Standaardfoto" : "Default photo"}
            </span>
          )}
        </div>
        <div className="space-y-1">
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
            className="text-sm"
          />
          <p className="text-xs text-zinc-500">
            {nl
              ? "Optioneel. Zonder afbeelding toont de eventpagina de standaardfoto."
              : "Optional. Without an image the event page shows the default photo."}
          </p>
          {uploading && (
            <p className="text-xs text-zinc-500">{nl ? "Bezig met uploaden..." : "Uploading..."}</p>
          )}
          {key && !uploading && (
            <button
              type="button"
              onClick={() => {
                setKey("");
                setPreviewUrl(null);
              }}
              className="text-xs text-red-600 hover:underline"
            >
              {nl ? "Afbeelding verwijderen" : "Remove image"}
            </button>
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      </div>
    </div>
  );
}
