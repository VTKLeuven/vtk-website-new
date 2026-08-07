"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { UploadIcon } from "@/components/ui/icons";

/**
 * Bestandskiezer in de stijl van de rest van het beheer.
 *
 * Een kale `<input type="file">` tekent de knop van het besturingssysteem
 * ("Choose file — No file chosen"), die niets deelt met de andere velden: geen
 * afgeronde hoeken, geen kleuren, en in het Engels ook al staat de rest in het
 * Nederlands. Het patroon hieronder stond al in StorageImageField; dit is
 * dezelfde aanpak als los veld, zodat elk uploadformulier het kan gebruiken.
 *
 * De echte input blijft bestaan en enkel visueel verborgen (`sr-only`, dus niet
 * `display: none`): zo blijft hij focusbaar, doet `required` het nog, en komt het
 * bestand gewoon in de FormData terecht.
 */
export function FileField({
  name,
  accept,
  multiple = false,
  required = false,
  disabled = false,
  locale,
  chooseLabel,
  hint,
  onChange,
}: {
  name?: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  disabled?: boolean;
  locale: "nl" | "en";
  /** Tekst op de knop; standaard "Bestand kiezen" of "Bestanden kiezen". */
  chooseLabel?: string;
  /** Korte toelichting onder de knop, bv. de toegestane formaten. */
  hint?: string;
  onChange?: (files: FileList | null) => void;
}) {
  const nl = locale === "nl";
  const [names, setNames] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // De uploadformulieren roepen na een geslaagde upload `form.reset()` aan. Dat
  // leegt de input zelf, maar niet onze weergave; zonder dit bleef de naam van
  // het net geüploade bestand staan alsof het nog klaarstond.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const clear = () => setNames([]);
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  function handle(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    setNames(files ? Array.from(files).map((f) => f.name) : []);
    onChange?.(files);
  }

  const buttonLabel =
    chooseLabel ??
    (multiple
      ? nl
        ? "Bestanden kiezen"
        : "Choose files"
      : nl
        ? "Bestand kiezen"
        : "Choose file");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label
          className={`inline-flex items-center gap-2 rounded-full border border-vtk-blue/15 px-4 py-2 text-sm font-medium transition-colors ${
            disabled
              ? "cursor-default opacity-60"
              : "cursor-pointer hover:border-vtk-blue/30 hover:bg-vtk-blue-soft/70"
          }`}
        >
          <UploadIcon />
          {buttonLabel}
          <input
            ref={inputRef}
            type="file"
            name={name}
            accept={accept}
            multiple={multiple}
            required={required}
            disabled={disabled}
            onChange={handle}
            className="sr-only"
          />
        </label>
        <span className="min-w-0 text-sm text-vtk-blue-muted">
          {names.length === 0
            ? nl
              ? "Nog niets gekozen"
              : "Nothing selected yet"
            : names.length === 1
              ? names[0]
              : `${names.length} ${nl ? "bestanden gekozen" : "files selected"}`}
        </span>
      </div>
      {hint ? <p className="text-xs text-vtk-blue-muted">{hint}</p> : null}
    </div>
  );
}
