"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { useNewAlbum } from "./MediaLibrary";

/** Rechts, zolang er geen album open staat: wat je hier kan doen, en de snelste weg. */
export function EmptyLibrary({ locale }: { locale: string }) {
  const nl = locale === "nl";
  const openNew = useNewAlbum();
  const [dragging, setDragging] = useState(false);

  return (
    <div className="media-empty">
      <label
        className="media-dropzone is-large"
        data-dragging={dragging ? "true" : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          openNew(Array.from(event.dataTransfer.files));
        }}
      >
        <ImagePlus aria-hidden="true" size={26} />
        <b>{nl ? "Sleep hier de foto's van een activiteit" : "Drop the photos of an activity here"}</b>
        <span>
          {nl
            ? "Ze komen in een nieuw album. Wil je een bestaand album aanvullen, open het dan links en sleep ze daar."
            : "They go into a new album. To add to an existing album, open it on the left and drop them there."}
        </span>
        <span className="ticket-admin-button" data-variant="primary">
          {nl ? "Foto's kiezen" : "Choose photos"}
        </span>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            openNew(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
