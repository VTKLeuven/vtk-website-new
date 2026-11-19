"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { useNewAlbum } from "./MediaLibrary";

/**
 * Rechts, zolang er geen album open staat: wat je hier kan doen, en de snelste weg.
 *
 * Wie geen albums mag aanmaken (enkel `photos.upload`), kan hier niets slepen:
 * een gesleepte reeks zou een nieuw album worden. Die krijgt de uitleg waar het
 * wel kan.
 */
export function EmptyLibrary({ locale, canCreate }: { locale: string; canCreate: boolean }) {
  const nl = locale === "nl";
  const openNew = useNewAlbum();
  const [dragging, setDragging] = useState(false);

  if (!canCreate) {
    return (
      <div className="media-empty">
        <div className="media-dropzone is-large is-static">
          <ImagePlus aria-hidden="true" size={26} />
          <b>{nl ? "Kies links een album" : "Choose an album on the left"}</b>
          <span>
            {nl
              ? "Open het album van de activiteit en sleep de foto's daar. Een nieuw album maken, of een album op de site zetten, doet iemand die albums beheert."
              : "Open the album of the activity and drop the photos there. Creating a new album, or putting one on the site, is done by someone who manages albums."}
          </span>
        </div>
      </div>
    );
  }

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
