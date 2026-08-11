"use client";

import { useRef, useState } from "react";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import type { FieldLocale } from "@/components/forms/FormFieldInput";

export type UploadedFile = { token: string; name: string; sizeBytes: number };

/**
 * Bestanden gaan meteen naar de server, nog voor het formulier verstuurd wordt.
 * De browser houdt enkel een ondertekende verwijzing bij. Zo kan er een echte
 * voortgangsbalk zijn en hoeft het formulier zelf geen megabytes te versturen.
 */
export function FormFileField({
  formId,
  fieldId,
  locale,
  maxFiles,
  accept,
  files,
  onChange,
  disabled,
  describedById,
}: {
  formId: string;
  fieldId: string;
  locale: FieldLocale;
  maxFiles: number;
  accept?: string;
  files: UploadedFile[];
  onChange: (next: UploadedFile[]) => void;
  disabled?: boolean;
  describedById?: string;
}) {
  const nl = locale === "nl";
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ name: string; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function upload(file: File) {
    setError(null);
    setProgress({ name: file.name, percent: 0 });

    // XMLHttpRequest en niet fetch: enkel hier bestaat een bruikbare
    // voortgangsgebeurtenis voor een upload.
    const request = new XMLHttpRequest();
    const body = new FormData();
    body.append("fieldId", fieldId);
    body.append("file", file);

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      setProgress({ name: file.name, percent: Math.round((event.loaded / event.total) * 100) });
    });
    request.addEventListener("load", () => {
      setProgress(null);
      if (request.status >= 200 && request.status < 300) {
        try {
          const result = JSON.parse(request.responseText) as UploadedFile;
          onChange([...files, result]);
          return;
        } catch {
          // valt door naar de foutmelding hieronder
        }
      }
      const reason = request.status === 413
        ? nl ? "Dit bestand is te groot." : "This file is too large."
        : request.status === 415
          ? nl ? "Dit bestandstype is niet toegelaten." : "This file type is not allowed."
          : nl ? "Uploaden is niet gelukt." : "The upload failed.";
      setError(reason);
    });
    request.addEventListener("error", () => {
      setProgress(null);
      setError(nl ? "Uploaden is niet gelukt." : "The upload failed.");
    });

    request.open("POST", `/api/forms/${formId}/uploads`);
    request.send(body);
  }

  const full = files.length >= maxFiles;

  return (
    <div className="vtk-form-files" aria-describedby={describedById}>
      <ul className="vtk-form-file-list">
        {files.map((file) => (
          <li key={file.token}>
            <Paperclip aria-hidden="true" size={15} />
            <span>{file.name}</span>
            <small>{Math.max(1, Math.round(file.sizeBytes / 1024))} kB</small>
            <IconButton
              label={nl ? "Bestand verwijderen" : "Remove file"}
              srLabel={`${nl ? "Bestand verwijderen" : "Remove file"}: ${file.name}`}
              tone="danger"
              onClick={() => onChange(files.filter((entry) => entry.token !== file.token))}
            >
              <Trash2 size={15} aria-hidden="true" />
            </IconButton>
          </li>
        ))}
      </ul>

      {progress ? (
        <div className="vtk-form-progress">
          <div className="vtk-form-progress-bar">
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          <p>
            <progress value={progress.percent} max={100} />
            {progress.name} · {progress.percent}%
          </p>
        </div>
      ) : null}

      {error ? <p className="vtk-form-error">{error}</p> : null}

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={accept}
        disabled={disabled || full}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className="vtk-form-file-button"
        disabled={disabled || full || Boolean(progress)}
        onClick={() => inputRef.current?.click()}
      >
        <Upload aria-hidden="true" size={15} />
        {full
          ? nl
            ? `Maximum van ${maxFiles} bereikt`
            : `Maximum of ${maxFiles} reached`
          : nl
            ? "Bestand kiezen"
            : "Choose a file"}
      </button>
    </div>
  );
}
