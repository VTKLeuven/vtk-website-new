"use client";

import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { createImmichAlbumAction } from "@/app/actions/media";
import { useUploads } from "./uploads";

/**
 * Een nieuw album: titel, foto's en of het meteen op de site staat.
 *
 * Het oude beheer had hier drie modi (één album, een album met tabs, een tab aan
 * een bestaand album). Tabs maak je nu in het album zelf, met "Tab toevoegen";
 * dit venster doet enkel het ene wat iedereen na een activiteit doet.
 */
export function NewAlbumDialog({
  locale,
  open,
  initialFiles,
  fakbarEnabled,
  onClose,
}: {
  locale: string;
  open: boolean;
  /** Foto's die al op de lege pagina gesleept werden. */
  initialFiles: File[];
  /** Mag de fakbargalerij als bestemming? Zie lib/fakbar-gallery.ts. */
  fakbarEnabled: boolean;
  onClose: () => void;
}) {
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/media`;
  const router = useRouter();
  const { enqueue } = useUploads();
  const titleId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visible, setVisible] = useState(true);
  const [gallery, setGallery] = useState<"main" | "fakbar">("main");
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Elke keer dat het venster opengaat: een leeg formulier met de gesleepte
  // foto's erin, en de cursor in de titel.
  const [openedWith, setOpenedWith] = useState<File[] | null>(null);
  if (open && openedWith !== initialFiles) {
    setOpenedWith(initialFiles);
    setFiles(initialFiles);
    setTitle("");
    setDescription("");
    setVisible(true);
    setGallery("main");
    setError(null);
  }
  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open) return null;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    setFiles((current) => [...current, ...picked]);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError(nl ? "Geef het album een titel." : "Give the album a title.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const data = new FormData();
      data.set("title", title.trim());
      data.set("description", description.trim());
      data.set("visible", visible ? "true" : "false");
      data.set("gallery", gallery);
      const result = await unsentGuard.run(() => createImmichAlbumAction(data));
      if (result === UNSENT) return;
      if (!result.ok || !result.albumId) {
        setError(
          result.error === "fakbar_upload_disabled"
            ? nl
              ? "Uploaden naar de fakbargalerij staat uit."
              : "Uploading to the fakbar gallery is switched off."
            : nl
              ? "Het album is niet aangemaakt: de fotobibliotheek is niet bereikbaar. Probeer straks opnieuw."
              : "The album was not created: the photo library is unreachable. Try again later.",
        );
        return;
      }
      enqueue({ albumId: result.albumId, partId: result.albumId, albumTitle: title.trim(), gallery, files });
      onClose();
      // De fakbargalerij staat niet in deze lijst; daar valt niets te openen.
      if (gallery === "main") router.push(`${base}/albums/${encodeURIComponent(result.albumId)}`);
    });
  }

  return (
    <div className="media-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !pending && onClose()}>
      <form className="media-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit}>
        <div className="media-dialog-head">
          <h2 id={titleId}>{nl ? "Nieuw album" : "New album"}</h2>
          <button
            type="button"
            className="ticket-admin-icon-button"
            onClick={onClose}
            disabled={pending}
            aria-label={nl ? "Sluiten" : "Close"}
            title={nl ? "Sluiten" : "Close"}
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        <label className="ticket-admin-field">
          <span>{nl ? "Titel" : "Title"}</span>
          <input
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            placeholder={nl ? "Openingsavond" : "Opening night"}
            required
          />
        </label>
        <label className="ticket-admin-field">
          <span>{nl ? "Beschrijving (optioneel)" : "Description (optional)"}</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
        </label>

        <label
          className="media-dropzone"
          data-dragging={dragging ? "true" : undefined}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
        >
          <ImagePlus aria-hidden="true" size={20} />
          <span>
            {files.length > 0 ? (
              <>
                <b>
                  {files.length} {nl ? "foto('s) gekozen" : "photo(s) chosen"}
                </b>
                {nl ? ". Sleep er meer bij of " : ". Drop more or "}
                <u>{nl ? "kies er nog" : "pick more"}</u>.
              </>
            ) : (
              <>
                {nl ? "Sleep de foto's hierheen of " : "Drop the photos here or "}
                <u>{nl ? "kies bestanden" : "choose files"}</u>.{" "}
                {nl ? "Je kan ook eerst een leeg album maken." : "You can also create an empty album first."}
              </>
            )}
          </span>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            className="sr-only"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>

        <div className="media-switch-row">
          <button
            type="button"
            role="switch"
            aria-checked={visible}
            className="media-switch"
            onClick={() => setVisible((value) => !value)}
            aria-labelledby={`${titleId}-visible`}
          />
          <span id={`${titleId}-visible`}>
            <b>{visible ? (nl ? "Meteen op vtk.be" : "On vtk.be right away") : nl ? "Eerst nakijken" : "Review first"}</b>
            <small>
              {visible
                ? nl
                  ? "Het album staat op de mediapagina zodra de foto's binnen zijn."
                  : "The album appears on the media page once the photos are in."
                : nl
                  ? "Het album blijft verborgen tot je het zelf aanzet."
                  : "The album stays hidden until you switch it on."}
            </small>
          </span>
        </div>

        {fakbarEnabled ? (
          <fieldset className="media-gallery-choice">
            <legend>{nl ? "Naar welke galerij" : "Which gallery"}</legend>
            <label>
              <input type="radio" name="gallery" checked={gallery === "main"} onChange={() => setGallery("main")} />
              {nl ? "Fotogalerij van vtk.be" : "vtk.be photo gallery"}
            </label>
            <label>
              <input type="radio" name="gallery" checked={gallery === "fakbar"} onChange={() => setGallery("fakbar")} />
              {nl ? "Fotogalerij van 't ElixIr" : "'t ElixIr photo gallery"}
            </label>
          </fieldset>
        ) : null}

        {error ? <p className="ticket-admin-inline-error">{error}</p> : null}

        <div className="media-dialog-actions">
          <button type="button" className="ticket-admin-button" onClick={onClose} disabled={pending}>
            {nl ? "Annuleren" : "Cancel"}
          </button>
          <button type="submit" className="ticket-admin-button" data-variant="primary" disabled={pending}>
            {pending
              ? nl
                ? "Bezig…"
                : "Working…"
              : files.length > 0
                ? nl
                  ? `Album maken en ${files.length} foto('s) uploaden`
                  : `Create album and upload ${files.length} photo(s)`
                : nl
                  ? "Album maken"
                  : "Create album"}
          </button>
        </div>
      </form>
    </div>
  );
}
