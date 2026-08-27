"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Label } from "@vtk/ui";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon, UploadIcon } from "@/components/ui/icons";
import { useReportFormBusy } from "@/components/ui/formBusy";
import {
  formatBytes,
  isAllowedReceiptName,
  MAX_RECEIPT_BYTES,
  RECEIPT_ACCEPT,
} from "@/lib/rekeningen/expenses";

/**
 * De foto of PDF van het bonnetje.
 *
 * Uploadt meteen naar `/api/admin/rekeningen/upload` en houdt enkel de storage-key
 * in verborgen velden bij, zoals `StorageImageField` dat voor gewone
 * afbeeldingen doet. Het veld meldt via `useReportFormBusy` dat het bezig is,
 * zodat de `SaveForm` eromheen niet kan verzenden met een nog lege key: dan zou
 * je een groene toast krijgen bij een rekening zonder bonnetje.
 */

type Existing = { key: string; name: string; mime: string; size: number; previewUrl: string };

export function ReceiptField({
  locale,
  existing,
}: {
  locale: "nl" | "en";
  /** Bij bewerken: het bonnetje dat er nu aan hangt. */
  existing?: Existing;
}) {
  const nl = locale === "nl";
  const [value, setValue] = useState<{
    key: string;
    name: string;
    mime: string;
    size: number;
  } | null>(existing ? { ...existing } : null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(existing?.previewUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useReportFormBusy(uploading);

  // `SaveForm` roept na een geslaagde indiening `form.reset()` aan. Dat leegt de
  // gewone velden, maar niet deze: de key zit in door React beheerde verborgen
  // velden. Zonder dit hing het vorige bonnetje nog klaar en kreeg de volgende
  // rekening dezelfde foto, onder een groene toast.
  const initial = useRef(existing);
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setValue(initial.current ? { ...initial.current } : null);
      setPreviewUrl(initial.current?.previewUrl ?? null);
      setError(null);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  // Bij bewerken telt "niets gekozen" als "laat het bestaande bonnetje staan";
  // de action leest een lege key zo. Bij een nieuwe rekening is het bonnetje
  // verplicht, en dan blokkeert `required` op de input het verzenden.
  const isNew = !existing;

  async function upload(file: File) {
    setError(null);
    if (!isAllowedReceiptName(file.name)) {
      setError(
        nl
          ? "Enkel .jpg, .jpeg, .png en .pdf zijn toegelaten."
          : "Only .jpg, .jpeg, .png and .pdf are allowed.",
      );
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setError(
        nl
          ? `Dat bestand is te groot (max ${formatBytes(MAX_RECEIPT_BYTES, locale)}).`
          : `That file is too large (max ${formatBytes(MAX_RECEIPT_BYTES, locale)}).`,
      );
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/admin/rekeningen/upload", { method: "POST", body });
      if (!response.ok) {
        setError(
          nl
            ? "Uploaden mislukt; het bonnetje is niet bewaard."
            : "Upload failed; the receipt was not saved.",
        );
        return;
      }
      const data = (await response.json()) as {
        key: string;
        name: string;
        size: number;
        mime: string;
      };
      setValue(data);
      // Een lokale blob-URL: het net geüploade bestand staat al in de browser, en
      // zo is de preview er meteen zonder het opnieuw te downloaden.
      setPreviewUrl(data.mime.startsWith("image/") ? URL.createObjectURL(file) : null);
    } catch {
      setError(
        nl
          ? "Uploaden mislukt; het bonnetje is niet bewaard."
          : "Upload failed; the receipt was not saved.",
      );
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    setValue(existing ? { ...existing } : null);
    setPreviewUrl(existing?.previewUrl ?? null);
    setError(null);
    // Anders weigert de browser hetzelfde bestand opnieuw: de waarde verandert
    // niet en `change` vuurt niet.
    if (inputRef.current) inputRef.current.value = "";
  }

  const chosenSomethingNew = value !== null && value.key !== existing?.key;

  return (
    <div>
      <Label>{nl ? "Bonnetje" : "Receipt"}</Label>
      <input type="hidden" name="receiptKey" value={chosenSomethingNew ? value.key : ""} />
      <input type="hidden" name="receiptName" value={chosenSomethingNew ? value.name : ""} />
      <input type="hidden" name="receiptMime" value={chosenSomethingNew ? value.mime : ""} />
      <input
        type="hidden"
        name="receiptSize"
        value={chosenSomethingNew ? String(value.size) : ""}
      />

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:gap-4">
        <div className="relative grid aspect-[3/4] w-28 shrink-0 place-items-center overflow-hidden rounded-xl border border-vtk-blue/15 bg-white">
          {previewUrl ? (
            // Onbewerkt: de bron is ofwel een blob-URL van het net gekozen
            // bestand, ofwel een route achter een login. De beeldoptimizer haalt
            // geen van beide op (hij stuurt geen sessiecookie mee).
            <Image src={previewUrl} alt="" fill sizes="112px" unoptimized className="object-cover" />
          ) : value ? (
            <div className="flex flex-col items-center gap-1 text-[#5c667f]">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <span className="text-[10px] font-semibold uppercase tracking-wide">PDF</span>
            </div>
          ) : (
            <div className="grid h-full w-full place-items-center bg-[repeating-linear-gradient(-45deg,var(--paper-2)_0_8px,var(--paper)_8px_16px)]">
              <span className="rounded-md bg-white/85 px-1.5 py-0.5 text-[11px] font-medium text-[#5c667f]">
                {nl ? "Nog geen bonnetje" : "No receipt yet"}
              </span>
            </div>
          )}
        </div>

        <div className="w-full min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
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
                : value
                  ? nl
                    ? "Ander bestand kiezen"
                    : "Choose another file"
                  : nl
                    ? "Bestand kiezen"
                    : "Choose file"}
              <input
                ref={inputRef}
                type="file"
                accept={RECEIPT_ACCEPT}
                // Bij een nieuwe rekening moet er een bestand gekozen zijn; is er
                // al één geüpload, dan mag het veld leeg omdat de key intussen in
                // de verborgen velden zit.
                required={isNew && value === null}
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
                className="sr-only"
              />
            </label>
            {chosenSomethingNew && (
              <IconButton
                label={nl ? "Keuze ongedaan maken" : "Undo choice"}
                srLabel={
                  nl ? `Keuze ongedaan maken: ${value.name}` : `Undo choice: ${value.name}`
                }
                tone="danger"
                onClick={clear}
              >
                <TrashIcon />
              </IconButton>
            )}
          </div>

          <p className="text-sm text-[#5c667f]">
            {value
              ? `${value.name} · ${formatBytes(value.size, locale)}`
              : nl
                ? "Nog niets gekozen"
                : "Nothing selected yet"}
          </p>
          <p className="text-xs text-[#5c667f]">
            {nl
              ? `Foto of PDF, max ${formatBytes(MAX_RECEIPT_BYTES, locale)}. Fotografeer het bonnetje volledig en zo vlak mogelijk; de boekhouder moet de prijzen kunnen lezen.`
              : `Photo or PDF, max ${formatBytes(MAX_RECEIPT_BYTES, locale)}. Photograph the whole receipt as flat as possible; the accountant has to read the prices.`}
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
