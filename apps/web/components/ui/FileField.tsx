"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { UploadIcon } from "@/components/ui/icons";
import { FileDropOverlay, useFileDrop } from "@/components/ui/FileDrop";

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
 *
 * Op een computer is het veld ook een sleepzone. Een gesleept bestand gaat in
 * diezelfde input, met een `change`-event erbij, zodat het formulier het niet
 * anders ziet dan een bestand uit het systeemdialoog.
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
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // De uploadformulieren roepen na een geslaagde upload `form.reset()` aan. Dat
  // leegt de input zelf, maar niet onze weergave; zonder dit bleef de naam van
  // het net geüploade bestand staan alsof het nog klaarstond.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const clear = () => {
      setNames([]);
      setError(null);
    };
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  function handle(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    setNames(files ? Array.from(files).map((f) => f.name) : []);
    setError(null);
    onChange?.(files);
  }

  const drop = useFileDrop({
    accept,
    multiple,
    disabled,
    onFiles: (files) => {
      const input = inputRef.current;
      if (!input) return;
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(file);
      input.files = transfer.files;
      // Een toegekende `files` vuurt zelf geen `change`; zonder dit event zag
      // React (en wie op het formulier luistert) de keuze niet.
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    onReject: (reason) =>
      setError(
        reason === "multiple"
          ? nl
            ? "Sleep één bestand tegelijk: dit veld neemt er maar één."
            : "Drop one file at a time: this field takes only one."
          : nl
            ? "Dit veld aanvaardt dat soort bestand niet."
            : "This field does not accept that kind of file.",
      ),
  });

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
    <div {...drop.zoneProps} className="relative space-y-2">
      {drop.dragging && (
        <FileDropOverlay className="-inset-2">
          {multiple
            ? nl
              ? "Laat los om de bestanden te kiezen"
              : "Drop to choose the files"
            : nl
              ? "Laat los om het bestand te kiezen"
              : "Drop to choose the file"}
        </FileDropOverlay>
      )}
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
          {names.length === 0 ? (
            <>
              {/* Enkel met een muis: op een telefoon sleep je geen bestanden. */}
              <span className="pointer-fine:hidden">
                {nl ? "Nog niets gekozen" : "Nothing selected yet"}
              </span>
              <span className="hidden pointer-fine:inline">
                {multiple
                  ? nl
                    ? "of sleep de bestanden hierheen"
                    : "or drop the files here"
                  : nl
                    ? "of sleep het bestand hierheen"
                    : "or drop the file here"}
              </span>
            </>
          ) : names.length === 1 ? (
            names[0]
          ) : (
            `${names.length} ${nl ? "bestanden gekozen" : "files selected"}`
          )}
        </span>
      </div>
      {hint ? <p className="text-xs text-vtk-blue-muted">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
