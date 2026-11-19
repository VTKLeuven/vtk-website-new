"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlbumList } from "./AlbumList";
import { NewAlbumDialog } from "./NewAlbumDialog";
import { UploadProvider } from "./uploads";
import type { LibraryRow } from "./types";
import type { AlbumRights } from "@/lib/media-album-access-shared";

/** Opent het venster voor een nieuw album, eventueel met al gekozen foto's. */
const NewAlbumContext = createContext<(files?: File[]) => void>(() => {});

export function useNewAlbum(): (files?: File[]) => void {
  return useContext(NewAlbumContext);
}

/**
 * Foto's in twee panelen: links alle albums, rechts het album dat open staat
 * (de pagina eronder). Zie `docs/design-decisions.md`, "Mediabeheer".
 */
export function MediaLibrary({
  locale,
  rows,
  error,
  trashCount,
  fakbarEnabled,
  rights,
  children,
}: {
  locale: string;
  rows: LibraryRow[];
  error: boolean;
  trashCount: number;
  fakbarEnabled: boolean;
  /** Wat deze gebruiker mag; zie `lib/media-album-access.ts`. */
  rights: AlbumRights;
  children: ReactNode;
}) {
  const [dialog, setDialog] = useState<{ open: boolean; files: File[] }>({ open: false, files: [] });
  // Telkens een nieuwe lijst, ook leeg: het venster herkent daaraan dat het
  // opnieuw opengaat en begint dan met een leeg formulier.
  const openNew = useCallback((files: File[] = []) => setDialog({ open: true, files: [...files] }), []);
  const close = useCallback(() => setDialog((current) => ({ ...current, open: false })), []);

  return (
    <UploadProvider locale={locale}>
      <NewAlbumContext.Provider value={openNew}>
        <div className="media-library">
          <AlbumList
            locale={locale}
            rows={rows}
            error={error}
            trashCount={trashCount}
            onNewAlbum={rights.create ? () => openNew() : null}
            showTrash={rights.manage}
          />
          <section className="media-library-main">{children}</section>
        </div>
        <NewAlbumDialog
          locale={locale}
          open={dialog.open && rights.create}
          canPublish={rights.manage}
          initialFiles={dialog.files}
          fakbarEnabled={fakbarEnabled}
          onClose={close}
        />
      </NewAlbumContext.Provider>
    </UploadProvider>
  );
}
