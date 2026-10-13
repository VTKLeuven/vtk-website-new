"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Eye, EyeOff, ImagePlus, Play, Plus, Star, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@vtk/ui";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { SaveForm } from "@/components/ui/SaveForm";
import { useToast } from "@/components/ui/toast";
import {
  addAlbumTabAction,
  detachAlbumTabAction,
  hidePhotosAction,
  movePhotosToTabAction,
  renameAlbumTabAction,
  saveAlbumDetailsAction,
  setAlbumCoverAction,
  setAlbumVisibilityAction,
  showPhotosAction,
  trashAlbumAction,
  trashPhotosAction,
} from "@/app/actions/media-albums";
import { PHOTO_PAGE_SIZE, TRASH_DAYS, adminThumbnailUrl } from "@/lib/media-admin-shared";
import { SAVE_IDLE, type SaveAction } from "@/lib/saveState";
import { albumErrorMessages } from "../../messages";
import { useUploads } from "../../uploads";

type Photo = { id: string; filename: string; hidden: boolean; video: boolean };
type Part = { id: string; name: string; photos: Photo[] };

/**
 * Het album rechts: titel, zichtbaarheid, tabs, uploaden en de foto's zelf.
 *
 * Een foto selecteer je met een klik (shift-klik voor een reeks); wat je met de
 * selectie kan, staat in één balk onderaan. Verbergen en de cover zetten kan
 * ook rechtstreeks op de foto, want dat doe je meestal met één tegelijk.
 * Verborgen foto's blijven hier staan, gedimd: van de site, niet uit het beheer.
 */
export function AlbumManager({
  locale,
  album,
  parts,
  publicPath,
}: {
  locale: string;
  album: {
    id: string;
    title: string;
    description: string;
    date: string | null;
    hidden: boolean;
    coverAssetId: string | null;
    hasOwnTabName: boolean;
  };
  parts: Part[];
  publicPath: string | null;
}) {
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/media`;
  const router = useRouter();
  const showToast = useToast();
  const messages = albumErrorMessages(nl ? "nl" : "en");
  const { jobs, enqueue } = useUploads();
  const [pending, startTransition] = useTransition();

  const [partIndex, setPartIndex] = useState(0);
  const [view, setView] = useState<"all" | "hidden">("all");
  const [limit, setLimit] = useState(PHOTO_PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<null | "photos" | "album">(null);
  const [addingTab, setAddingTab] = useState(false);
  const [dragging, setDragging] = useState(false);

  const part = parts[Math.min(partIndex, parts.length - 1)];
  const hasTabs = parts.length > 1;
  const job = jobs.find((item) => item.albumId === album.id);
  const numberFormat = useMemo(() => new Intl.NumberFormat(nl ? "nl-BE" : "en-GB"), [nl]);
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", { day: "numeric", month: "long", year: "numeric" }),
    [nl],
  );

  const onSite = parts.reduce((sum, item) => sum + item.photos.filter((photo) => !photo.hidden).length, 0);
  const hiddenHere = part.photos.filter((photo) => photo.hidden).length;
  // Zonder verborgen foto's verdwijnt de filter; bleef hij op "Verborgen" staan,
  // dan zat je vast op een leeg raster zonder knop om terug te gaan.
  const showing = hiddenHere === 0 ? "all" : view;
  const list = showing === "hidden" ? part.photos.filter((photo) => photo.hidden) : part.photos;
  const shown = list.slice(0, limit);
  const picked = part.photos.filter((photo) => selected.has(photo.id));
  const pickedVisible = picked.filter((photo) => !photo.hidden).map((photo) => photo.id);
  const pickedHidden = picked.filter((photo) => photo.hidden).map((photo) => photo.id);

  // Escape wist de selectie, zoals in elke fotobibliotheek.
  useEffect(() => {
    if (selected.size === 0 || confirm) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size, confirm]);

  function choosePart(index: number) {
    setPartIndex(index);
    setSelected(new Set());
    setAnchor(null);
    setView("all");
    setLimit(PHOTO_PAGE_SIZE);
  }

  function toggle(index: number, range: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (range && anchor !== null) {
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
        for (const photo of shown.slice(from, to + 1)) next.add(photo.id);
      } else if (next.has(shown[index].id)) {
        next.delete(shown[index].id);
      } else {
        next.add(shown[index].id);
      }
      return next;
    });
    setAnchor(index);
  }

  /** Een actie uitvoeren en de uitkomst als toast tonen (zie CLAUDE.md). */
  function run(action: SaveAction, fields: Record<string, string>, success: string, after?: () => void) {
    startTransition(async () => {
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) data.set(key, value);
      const state = await action(SAVE_IDLE, data);
      setConfirm(null);
      if (state.status === "success") {
        showToast({ message: success, variant: "success" });
        setSelected(new Set());
        after?.();
      } else if (state.status === "error") {
        showToast({
          message: messages[state.code] ?? state.detail ?? (nl ? "Niet gelukt." : "Failed."),
          variant: "error",
          duration: 0,
        });
        // Half gelukt is ook gewijzigd; de server heeft de pagina al ververst.
        setSelected(new Set());
      }
    });
  }

  const photoCount = (count: number) =>
    nl ? `${count} foto${count === 1 ? "" : "'s"}` : `${count} photo${count === 1 ? "" : "s"}`;

  function hide(ids: string[]) {
    run(
      hidePhotosAction,
      { albumId: album.id, partId: part.id, assetIds: ids.join(",") },
      nl ? `${photoCount(ids.length)} verborgen op vtk.be.` : `${photoCount(ids.length)} hidden on vtk.be.`,
    );
  }

  function show(ids: string[]) {
    run(
      showPhotosAction,
      { assetIds: ids.join(",") },
      nl ? `${photoCount(ids.length)} weer op vtk.be.` : `${photoCount(ids.length)} back on vtk.be.`,
    );
  }

  function upload(files: File[]) {
    const media = files.filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (media.length === 0) {
      showToast({
        message: nl ? "Daar zat geen foto of video bij." : "There was no photo or video in there.",
        variant: "error",
        duration: 0,
      });
      return;
    }
    enqueue({ albumId: album.id, partId: part.id, albumTitle: album.title, files: media });
  }

  return (
    <div
      className="media-album"
      data-dragging={dragging ? "true" : undefined}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDragging(false);
        upload(Array.from(event.dataTransfer.files));
      }}
    >
      <header className="media-album-head">
        {album.coverAssetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="media-album-cover" src={adminThumbnailUrl(album.coverAssetId)} alt="" />
        ) : (
          <span className="media-album-cover is-blank" aria-hidden="true" />
        )}
        <div className="media-album-head-main">
          <SaveForm
            action={saveAlbumDetailsAction}
            submitLabel={nl ? "Opslaan" : "Save"}
            savingLabel={nl ? "Opslaan…" : "Saving…"}
            savedMessage={nl ? "Album opgeslagen." : "Album saved."}
            errorMessages={messages}
            fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
            resetOnSuccess={false}
            submitSize="sm"
            className="media-album-details"
          >
            <input type="hidden" name="albumId" value={album.id} />
            <label className="sr-only" htmlFor="media-album-title">
              {nl ? "Titel" : "Title"}
            </label>
            <input
              id="media-album-title"
              name="title"
              className="media-album-title"
              defaultValue={album.title}
              required
              maxLength={200}
            />
            <p className="media-album-title-hint">
              {nl
                ? "De titel bepaalt het adres op de site: oude links naar dit album werken na een nieuwe titel niet meer."
                : "The title sets the address on the site: old links to this album stop working after a new title."}
            </p>
            <label className="sr-only" htmlFor="media-album-description">
              {nl ? "Beschrijving" : "Description"}
            </label>
            <input
              id="media-album-description"
              name="description"
              className="media-album-description"
              defaultValue={album.description}
              maxLength={1000}
              placeholder={nl ? "Beschrijving (optioneel)" : "Description (optional)"}
            />
          </SaveForm>
          <p className="media-album-meta num">
            {[album.date ? dateFormat.format(new Date(album.date)) : null, photoCount(onSite)]
              .filter(Boolean)
              .join(" · ")}
            {publicPath ? (
              <>
                {" · "}
                <a href={publicPath} target="_blank" rel="noreferrer">
                  vtk.be{publicPath.replace(/^\/en/, "")}
                  <ExternalLink aria-hidden="true" size={12} />
                </a>
              </>
            ) : null}
          </p>
        </div>
      </header>

      <div className="media-switch-row is-card">
        <button
          type="button"
          role="switch"
          aria-checked={!album.hidden}
          className="media-switch"
          disabled={pending}
          aria-labelledby="media-album-visibility"
          onClick={() =>
            run(
              setAlbumVisibilityAction,
              { albumId: album.id, visible: album.hidden ? "true" : "false" },
              album.hidden
                ? nl
                  ? `${album.title} staat op vtk.be.`
                  : `${album.title} is on vtk.be.`
                : nl
                  ? `${album.title} staat niet meer op vtk.be.`
                  : `${album.title} is no longer on vtk.be.`,
            )
          }
        />
        <span id="media-album-visibility">
          <b>{album.hidden ? (nl ? "Verborgen" : "Hidden") : nl ? "Op vtk.be" : "On vtk.be"}</b>
          <small>
            {album.hidden
              ? nl
                ? "Enkel zichtbaar in dit beheer. Zet het aan om het op de mediapagina te tonen."
                : "Only visible in this admin. Switch it on to show it on the media page."
              : nl
                ? "Iedereen ziet dit album op de mediapagina."
                : "Everyone sees this album on the media page."}
          </small>
        </span>
      </div>

      <div className="media-tabs" role="group" aria-label="Tabs">
        <span className="media-tabs-label">Tabs</span>
        {hasTabs ? (
          parts.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="media-chip"
              aria-pressed={index === partIndex}
              onClick={() => choosePart(index)}
            >
              {item.name}
              <span className="num">{numberFormat.format(item.photos.filter((photo) => !photo.hidden).length)}</span>
            </button>
          ))
        ) : (
          <span className="media-tabs-none">
            {nl ? "Geen; alle foto's staan samen." : "None; all photos are together."}
          </span>
        )}
        <button type="button" className="media-chip" aria-expanded={addingTab} onClick={() => setAddingTab((value) => !value)}>
          <Plus aria-hidden="true" size={14} />
          {nl ? "Tab toevoegen" : "Add tab"}
        </button>
      </div>

      {addingTab ? (
        <SaveForm
          action={addAlbumTabAction}
          submitLabel={nl ? "Tab toevoegen" : "Add tab"}
          savingLabel={nl ? "Bezig…" : "Working…"}
          savedMessage={nl ? "Tab toegevoegd. Sleep er foto's in." : "Tab added. Drop photos into it."}
          errorMessages={messages}
          fallbackErrorMessage={nl ? "Niet gelukt." : "Failed."}
          onSuccess={() => setAddingTab(false)}
          className="media-tab-form"
        >
          <input type="hidden" name="albumId" value={album.id} />
          <label className="ticket-admin-field">
            <span>{nl ? "Naam van de nieuwe tab" : "Name of the new tab"}</span>
            <input name="tabName" placeholder="Photobooth" maxLength={50} required />
          </label>
          {!album.hasOwnTabName ? (
            <label className="ticket-admin-field">
              <span>{nl ? "Naam voor de huidige foto's" : "Name for the current photos"}</span>
              <input name="parentTabName" placeholder={nl ? "Zaal" : "Hall"} maxLength={50} />
              <small>
                {nl ? "Leeg laten: die tab heet dan Algemeen op de site." : "Leave empty and that tab is called Algemeen on the site."}
              </small>
            </label>
          ) : null}
        </SaveForm>
      ) : null}

      {hasTabs ? (
        <AdminDisclosure
          variant="row"
          className="media-tab-manage"
          summary={nl ? "Tabs hernoemen of loskoppelen" : "Rename or detach tabs"}
        >
          <ul className="media-tab-list">
            {parts.map((item, index) => (
              <li key={item.id}>
                <SaveForm
                  action={renameAlbumTabAction}
                  submitLabel={nl ? "Naam opslaan" : "Save name"}
                  savingLabel={nl ? "Opslaan…" : "Saving…"}
                  savedMessage={nl ? "Tabnaam opgeslagen." : "Tab name saved."}
                  errorMessages={messages}
                  fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
                  resetOnSuccess={false}
                  submitSize="sm"
                  className="media-tab-rename"
                >
                  <input type="hidden" name="partId" value={item.id} />
                  <label className="sr-only" htmlFor={`tab-${item.id}`}>
                    {nl ? `Naam van tab ${index + 1}` : `Name of tab ${index + 1}`}
                  </label>
                  <input id={`tab-${item.id}`} name="tabName" defaultValue={item.name} maxLength={50} required />
                </SaveForm>
                {index > 0 ? (
                  <DeleteIconButton
                    action={detachAlbumTabAction}
                    fields={{ partId: item.id }}
                    label={nl ? "Tab loskoppelen" : "Detach tab"}
                    srLabel={nl ? `Tab loskoppelen: ${item.name}` : `Detach tab: ${item.name}`}
                    title={nl ? `Tab ${item.name} loskoppelen?` : `Detach tab ${item.name}?`}
                    description={
                      nl
                        ? `De ${item.photos.length} foto's blijven bestaan: deze tab wordt een eigen album, met een eigen kaart en een eigen adres op de site. Er wordt niets verwijderd.`
                        : `The ${item.photos.length} photos stay: this tab becomes its own album, with its own card and address on the site. Nothing is deleted.`
                    }
                    confirmLabel={nl ? "Loskoppelen" : "Detach"}
                    cancelLabel={nl ? "Annuleren" : "Cancel"}
                    successMessage={nl ? "Tab losgekoppeld; het is nu een eigen album." : "Tab detached; it is its own album now."}
                  />
                ) : (
                  <span className="media-tab-list-note">{nl ? "Het album zelf" : "The album itself"}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="media-tab-list-foot">
            {nl
              ? "Een tab hernoemen wijzigt haar adres op de site (?sub=…); bestaande links naar die tab werken daarna niet meer."
              : "Renaming a tab changes its address on the site (?sub=…); existing links to that tab stop working."}
          </p>
        </AdminDisclosure>
      ) : null}

      <label className="media-dropzone">
        <ImagePlus aria-hidden="true" size={20} />
        <span>
          {hasTabs
            ? nl
              ? <>Sleep foto&apos;s hierheen om ze toe te voegen aan <b>{part.name}</b>, of <u>kies bestanden</u>.</>
              : <>Drop photos here to add them to <b>{part.name}</b>, or <u>choose files</u>.</>
            : nl
              ? <>Sleep foto&apos;s hierheen om ze toe te voegen, of <u>kies bestanden</u>.</>
              : <>Drop photos here to add them, or <u>choose files</u>.</>}
        </span>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            upload(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </label>
      {job ? (
        <div className="media-album-upload" role="status">
          <span className="num">
            {nl ? `Uploaden ${job.done}/${job.total}` : `Uploading ${job.done}/${job.total}`}
            {job.failed ? (nl ? ` · ${job.failed} mislukt` : ` · ${job.failed} failed`) : ""}
          </span>
          <span className="media-progress" aria-hidden="true">
            <i style={{ width: `${Math.round((job.done / job.total) * 100)}%` }} />
          </span>
        </div>
      ) : null}

      <div className="media-grid-bar">
        <span className="num">
          {photoCount(part.photos.length - hiddenHere)}
          {hiddenHere ? (nl ? ` · ${hiddenHere} verborgen` : ` · ${hiddenHere} hidden`) : ""}
        </span>
        {hiddenHere > 0 ? (
          <span className="media-chips" role="group" aria-label={nl ? "Toon" : "Show"}>
            <button type="button" className="media-chip" aria-pressed={showing === "all"} onClick={() => setView("all")}>
              {nl ? "Alle" : "All"}
            </button>
            <button type="button" className="media-chip" aria-pressed={showing === "hidden"} onClick={() => setView("hidden")}>
              {nl ? "Verborgen" : "Hidden"}
              <span className="num">{hiddenHere}</span>
            </button>
          </span>
        ) : null}
        <span className="media-grid-bar-grow" />
        {shown.length > 0 ? (
          <button
            type="button"
            className="ticket-admin-button"
            onClick={() => setSelected(new Set(shown.map((photo) => photo.id)))}
          >
            {nl ? "Alles op dit scherm selecteren" : "Select everything on screen"}
          </button>
        ) : null}
      </div>

      {list.length === 0 ? (
        <p className="ticket-admin-empty-state media-grid-empty">
          {showing === "hidden"
            ? nl
              ? "Geen verborgen foto's in deze tab."
              : "No hidden photos in this tab."
            : nl
              ? "Nog geen foto's. Sleep ze hierheen of kies bestanden hierboven."
              : "No photos yet. Drop them here or choose files above."}
        </p>
      ) : (
        <ul className="media-photo-grid" data-selecting={selected.size > 0 ? "true" : undefined}>
          {shown.map((photo, index) => {
            const isSelected = selected.has(photo.id);
            const isCover = photo.id === album.coverAssetId;
            const name = photo.filename || (nl ? `Foto ${index + 1}` : `Photo ${index + 1}`);
            return (
              <li
                key={photo.id}
                className="media-photo"
                data-selected={isSelected ? "true" : undefined}
                data-hidden={photo.hidden ? "true" : undefined}
              >
                <button
                  type="button"
                  className="media-photo-hit"
                  aria-pressed={isSelected}
                  aria-label={photo.hidden ? `${name}, ${nl ? "verborgen" : "hidden"}` : name}
                  onClick={(event) => toggle(index, event.shiftKey)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={adminThumbnailUrl(photo.id)} alt="" loading="lazy" decoding="async" />
                  <span className="media-photo-check" aria-hidden="true">
                    <Check size={13} strokeWidth={3} />
                  </span>
                </button>
                <span className="media-photo-actions">
                  <IconButton
                    className="media-photo-action"
                    label={photo.hidden ? (nl ? "Tonen op vtk.be" : "Show on vtk.be") : nl ? "Verbergen op vtk.be" : "Hide on vtk.be"}
                    srLabel={`${photo.hidden ? (nl ? "Tonen op vtk.be" : "Show on vtk.be") : nl ? "Verbergen op vtk.be" : "Hide on vtk.be"}: ${name}`}
                    disabled={pending}
                    onClick={() => (photo.hidden ? show([photo.id]) : hide([photo.id]))}
                  >
                    {photo.hidden ? <Eye aria-hidden="true" size={15} /> : <EyeOff aria-hidden="true" size={15} />}
                  </IconButton>
                  {partIndex === 0 && !photo.hidden && !photo.video && !isCover ? (
                    <IconButton
                      className="media-photo-action"
                      label={nl ? "Als cover gebruiken" : "Use as cover"}
                      srLabel={`${nl ? "Als cover gebruiken" : "Use as cover"}: ${name}`}
                      disabled={pending}
                      onClick={() =>
                        run(
                          setAlbumCoverAction,
                          { albumId: album.id, assetId: photo.id },
                          nl ? "Cover ingesteld." : "Cover set.",
                        )
                      }
                    >
                      <Star aria-hidden="true" size={15} />
                    </IconButton>
                  ) : null}
                </span>
                {isCover ? (
                  <span className="media-photo-badge is-cover">Cover</span>
                ) : photo.hidden ? (
                  <span className="media-photo-badge is-hidden">
                    <EyeOff aria-hidden="true" size={11} />
                    {nl ? "Verborgen" : "Hidden"}
                  </span>
                ) : null}
                {photo.video ? (
                  <span className="media-photo-video" aria-hidden="true">
                    <Play size={11} fill="currentColor" />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {list.length > shown.length ? (
        <button type="button" className="ticket-admin-button media-more" onClick={() => setLimit((value) => value + PHOTO_PAGE_SIZE)}>
          {nl
            ? `Nog ${numberFormat.format(list.length - shown.length)} foto's tonen`
            : `Show ${numberFormat.format(list.length - shown.length)} more photos`}
        </button>
      ) : null}

      <div className="media-danger">
        <p>
          <b>{nl ? "Album naar de prullenmand" : "Move album to the trash"}</b>
          {nl
            ? `Het album gaat van vtk.be en uit deze lijst. ${TRASH_DAYS} dagen lang zet je het in de prullenmand terug.`
            : `The album leaves vtk.be and this list. For ${TRASH_DAYS} days you can put it back from the trash.`}
        </p>
        <button type="button" className="ticket-admin-button" data-variant="danger" onClick={() => setConfirm("album")}>
          <Trash2 aria-hidden="true" size={15} />
          {nl ? "Naar de prullenmand" : "Move to trash"}
        </button>
      </div>

      {selected.size > 0 ? (
        <div className="media-selection-bar" role="toolbar" aria-label={nl ? "Selectie" : "Selection"}>
          <b className="num">
            {selected.size} {nl ? "geselecteerd" : "selected"}
          </b>
          {pickedVisible.length > 0 ? (
            <button type="button" disabled={pending} onClick={() => hide(pickedVisible)}>
              <EyeOff aria-hidden="true" size={15} />
              {nl ? "Verbergen" : "Hide"}
            </button>
          ) : null}
          {pickedHidden.length > 0 ? (
            <button type="button" disabled={pending} onClick={() => show(pickedHidden)}>
              <Eye aria-hidden="true" size={15} />
              {nl ? "Tonen" : "Show"}
            </button>
          ) : null}
          {hasTabs && pickedVisible.length > 0 ? (
            <select
              value=""
              disabled={pending}
              aria-label={nl ? "Verplaats naar tab" : "Move to tab"}
              onChange={(event) => {
                const target = parts.find((item) => item.id === event.target.value);
                if (!target) return;
                run(
                  movePhotosToTabAction,
                  { albumId: album.id, fromPartId: part.id, toPartId: target.id, assetIds: pickedVisible.join(",") },
                  nl
                    ? `${photoCount(pickedVisible.length)} verplaatst naar ${target.name}.`
                    : `${photoCount(pickedVisible.length)} moved to ${target.name}.`,
                );
              }}
            >
              <option value="">{nl ? "Verplaats naar tab" : "Move to tab"}</option>
              {parts
                .filter((item) => item.id !== part.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          ) : null}
          <button type="button" className="is-danger" disabled={pending} onClick={() => setConfirm("photos")}>
            <Trash2 aria-hidden="true" size={15} />
            {nl ? "Verwijderen" : "Delete"}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            aria-label={nl ? "Selectie wissen" : "Clear selection"}
            title={nl ? "Selectie wissen" : "Clear selection"}
          >
            <X aria-hidden="true" size={15} />
          </button>
        </div>
      ) : null}

      {dragging ? (
        <div className="media-drop-overlay" aria-hidden="true">
          <ImagePlus size={28} />
          {hasTabs
            ? nl
              ? `Loslaten om toe te voegen aan ${part.name}`
              : `Release to add to ${part.name}`
            : nl
              ? `Loslaten om toe te voegen aan ${album.title}`
              : `Release to add to ${album.title}`}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm === "photos"}
        title={nl ? `${photoCount(selected.size)} verwijderen?` : `Delete ${photoCount(selected.size)}?`}
        description={
          nl
            ? selected.size === 1
              ? `De foto uit ${album.title} gaat naar de prullenmand en is meteen van vtk.be weg. ${TRASH_DAYS} dagen lang kan je ze daar terugzetten; de rest van het album blijft staan.`
              : `${photoCount(selected.size)} uit ${album.title} gaan naar de prullenmand en zijn meteen van vtk.be weg. ${TRASH_DAYS} dagen lang kan je ze daar terugzetten; de rest van het album blijft staan.`
            : selected.size === 1
              ? `The photo from ${album.title} goes to the trash and leaves vtk.be right away. For ${TRASH_DAYS} days you can put it back from there; the rest of the album stays.`
              : `${photoCount(selected.size)} from ${album.title} go to the trash and leave vtk.be right away. For ${TRASH_DAYS} days you can put them back from there; the rest of the album stays.`
        }
        confirmLabel={nl ? "Verwijderen" : "Delete"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          run(
            trashPhotosAction,
            { albumId: album.id, partId: part.id, assetIds: [...selected].join(",") },
            nl
              ? `${selected.size === 1 ? "Foto" : photoCount(selected.size)} naar de prullenmand. Je kan ze daar ${TRASH_DAYS} dagen terugzetten.`
              : `${selected.size === 1 ? "Photo" : photoCount(selected.size)} moved to the trash. You can restore ${selected.size === 1 ? "it" : "them"} there for ${TRASH_DAYS} days.`,
          )
        }
      />

      <ConfirmDialog
        open={confirm === "album"}
        title={nl ? `${album.title} naar de prullenmand?` : `Move ${album.title} to the trash?`}
        description={
          nl
            ? `Het album${hasTabs ? ` met zijn ${parts.length} tabs` : ""} en zijn ${photoCount(onSite + parts.reduce((sum, item) => sum + item.photos.filter((photo) => photo.hidden).length, 0))} gaan van vtk.be en uit deze lijst. ${TRASH_DAYS} dagen lang zet je het in de prullenmand in één klik terug; daarna is het definitief weg. De andere albums blijven staan.`
            : `The album${hasTabs ? ` with its ${parts.length} tabs` : ""} and its photos leave vtk.be and this list. For ${TRASH_DAYS} days you can put it back from the trash in one click; after that it is gone for good. The other albums stay.`
        }
        confirmLabel={nl ? "Naar de prullenmand" : "Move to trash"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          run(
            trashAlbumAction,
            { albumId: album.id },
            nl
              ? `${album.title} ligt in de prullenmand. Je kan het daar ${TRASH_DAYS} dagen terugzetten.`
              : `${album.title} is in the trash. You can restore it there for ${TRASH_DAYS} days.`,
            () => router.push(base),
          )
        }
      />
    </div>
  );
}
