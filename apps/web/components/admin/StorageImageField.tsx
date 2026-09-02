"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Label } from "@vtk/ui";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon, UploadIcon } from "@/components/ui/icons";
import { useReportFormBusy } from "@/components/ui/formBusy";
import { storageKeyPath } from "@/lib/storageKeyPath";

function mediaUrl(key: string): string {
  return `/api/media/${storageKeyPath(key)}`;
}

/**
 * Optionele foto-upload voor een formulier: uploadt naar de gedeelde
 * `/api/admin/upload`-route (die de foto naar JPEG hercodeert) en houdt enkel
 * de storage-key bij in een verborgen veld; de server action bewaart die.
 *
 * Het veld meldt via `useReportFormBusy` dat het bezig is, zodat de omliggende
 * `SaveForm` niet kan verzenden met een nog lege key. Verwijderen zet daarnaast
 * een expliciete vlag: de action leest dat met `readImageField`, en behandelt
 * "leeg zonder vlag" als "niet gewijzigd" in plaats van als "wis de foto".
 *
 * Geef `fallbackUrl` mee wanneer er zonder upload een echte standaardfoto
 * verschijnt: de preview toont die dan, in plaats van te beweren dat er een
 * standaardfoto is zonder ze te laten zien. Zonder `fallbackUrl` toont de
 * preview het gestreepte placeholder-patroon van de site.
 */
export function StorageImageField({
  defaultKey,
  locale,
  name = "imageKey",
  label,
  fallbackUrl,
  fallbackPosition = "center",
  previewPosition,
  emptyHint,
  helpText,
  srContext,
  formId,
  onChange,
}: {
  defaultKey?: string | null;
  locale: "nl" | "en";
  name?: string;
  label?: string;
  /** De foto die verschijnt zolang er geen upload is, bv. `/aanbod/theokot.jpg`. */
  fallbackUrl?: string;
  /** Uitsnede van de standaardfoto in de preview. */
  fallbackPosition?: "center" | "left";
  /**
   * `object-position` voor de geüploade foto in deze preview. Geef dit mee zodra
   * er elders een uitsnede gekozen wordt (`ImageFocusField`), anders toont deze
   * duimnagel de middenuitsnede terwijl de voorbeelden ernaast iets anders
   * tonen: twee kadertjes van dezelfde foto die elkaar tegenspreken.
   */
  previewPosition?: string;
  emptyHint?: string;
  helpText?: string;
  /** Waarover dit veld gaat ("Cursusdienst"), voor de screenreader-labels. */
  srContext?: string;
  /** Formulier waarvoor de upload gebeurt, voor de capability-check van de route. */
  formId?: string;
  /** Voor gecontroleerde editors die de key in hun eigen state bewaren. */
  onChange?: (key: string) => void;
}) {
  const nl = locale === "nl";
  const [key, setKey] = useState(defaultKey ?? "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    defaultKey ? mediaUrl(defaultKey) : null,
  );
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Enkel een klik op de prullenbak betekent "wis de bestaande foto". Bij een
  // nieuw item is er niets te wissen en blijft dit false.
  const [cleared, setCleared] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useReportFormBusy(uploading);

  async function onFile(file: File) {
    setErr(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "image");
      if (formId) form.append("formId", formId);
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      if (!res.ok) {
        setErr(nl ? "Upload mislukt; de foto is niet bewaard." : "Upload failed; the photo was not saved.");
        return;
      }
      const data = (await res.json()) as { key: string; url: string | null };
      setKey(data.key);
      setPreviewUrl(data.url ?? mediaUrl(data.key));
      setCleared(false);
      onChange?.(data.key);
    } catch {
      setErr(nl ? "Upload mislukt; de foto is niet bewaard." : "Upload failed; the photo was not saved.");
    } finally {
      setUploading(false);
    }
  }

  function onRemove() {
    setKey("");
    setPreviewUrl(null);
    setErr(null);
    setCleared(true);
    onChange?.("");
    // Anders weigert de browser hetzelfde bestand opnieuw te accepteren: de
    // waarde verandert niet en `change` vuurt niet.
    if (inputRef.current) inputRef.current.value = "";
  }

  const shownUrl = previewUrl ?? fallbackUrl ?? null;
  const showingFallback = previewUrl === null && fallbackUrl != null;
  const removeLabel = nl ? "Afbeelding verwijderen" : "Remove image";

  return (
    <div>
      <Label>{label ?? (nl ? "Afbeelding" : "Image")}</Label>
      <input type="hidden" name={name} value={key} />
      <input type="hidden" name={`${name}__cleared`} value={cleared ? "1" : ""} />
      {/* Smal: de preview boven de knop. Naast elkaar houdt de knop op een
          telefoon nog geen tien tekens over en breekt "Foto kiezen" in tweeën. */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:gap-4">
        <div className="relative grid aspect-[16/10] w-40 shrink-0 place-items-center overflow-hidden rounded-xl border border-vtk-blue/15">
          {shownUrl ? (
            <>
              {/* De preview is 160px breed; zonder next/image haalt de browser
                  hier de volledige upload binnen om er een duimnagel van te tonen. */}
              <Image
                src={shownUrl}
                alt=""
                fill
                sizes="160px"
                className={`object-cover ${
                  showingFallback
                    ? `${fallbackPosition === "left" ? "object-left" : "object-center"} opacity-60`
                    : ""
                }`}
                style={
                  !showingFallback && previewPosition
                    ? { objectPosition: previewPosition }
                    : undefined
                }
              />
              {showingFallback && (
                <span className="absolute bottom-1 left-1 rounded-md bg-white/85 px-1.5 py-0.5 text-[11px] font-medium text-[#5c667f]">
                  {emptyHint ?? (nl ? "Standaardfoto" : "Default photo")}
                </span>
              )}
            </>
          ) : (
            // Hetzelfde gestreepte patroon als de placeholder op de site, zodat
            // de preview toont wat een bezoeker echt te zien krijgt.
            <div className="grid h-full w-full place-items-center bg-[repeating-linear-gradient(-45deg,var(--paper-2)_0_8px,var(--paper)_8px_16px)]">
              <span className="rounded-md bg-white/85 px-1.5 py-0.5 text-[11px] font-medium text-[#5c667f]">
                {nl ? "Gestreept patroon" : "Striped pattern"}
              </span>
            </div>
          )}
        </div>
        <div className="w-full min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <label
              className={`inline-flex items-center gap-2 rounded-full border border-vtk-blue/15 px-3 py-1.5 text-sm transition-colors ${
                uploading
                  ? "cursor-default opacity-60"
                  : "cursor-pointer hover:border-vtk-blue/30 hover:bg-vtk-blue-soft/70"
              }`}
            >
              <UploadIcon />
              {uploading
                ? nl
                  ? "Bezig met uploaden..."
                  : "Uploading..."
                : key
                  ? nl
                    ? "Foto vervangen"
                    : "Replace photo"
                  : nl
                    ? "Foto kiezen"
                    : "Choose photo"}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
                className="sr-only"
              />
            </label>
            {key && !uploading && (
              <IconButton
                label={removeLabel}
                srLabel={srContext ? `${removeLabel}: ${srContext}` : removeLabel}
                tone="danger"
                onClick={onRemove}
              >
                <TrashIcon />
              </IconButton>
            )}
          </div>
          {helpText && <p className="text-xs text-[#5c667f]">{helpText}</p>}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      </div>
    </div>
  );
}
