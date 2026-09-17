"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ConfirmDialog, Label } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { FileField } from "@/components/ui/FileField";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE } from "@/lib/saveState";
import {
  detachPhotosAction,
  movePhotosToTabAction,
  setAlbumCoverAction,
  trashPhotosAction,
} from "@/app/actions/media-albums";
import {
  finalizeImmichAlbumAction,
  uploadImmichAlbumAssetAction,
} from "@/app/actions/media";
import { albumErrorMessages } from "./messages";

type Photo = { id: string; title: string; thumbnailUrl: string };
type Tab = { id: string; title: string; photos: Photo[] };

/**
 * De foto's van één album, per tab, met selectie.
 *
 * Selecteren en dan één balk met de acties, in plaats van een knoppenrij per
 * foto: bij tweehonderd foto's is dat tweehonderd keer dezelfde drie knoppen, en
 * wie foto's verplaatst doet dat zelden met één tegelijk.
 */
export function AlbumPhotoManager({
  locale,
  slug,
  albumId,
  coverPhotoId,
  tabs,
}: {
  locale: Locale;
  slug: string;
  /** Het hoofdalbum; de cover hangt daaraan, niet aan een tab. */
  albumId: string;
  coverPhotoId: string | null;
  tabs: Tab[];
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const showToast = useToast();
  const messages = albumErrorMessages(locale);
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? albumId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState("");
  const [confirming, setConfirming] = useState<null | "detach" | "trash">(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const selectedIds = [...selected];
  const hasTabs = tabs.length > 1;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function report(state: Awaited<ReturnType<typeof detachPhotosAction>>, success: string) {
    if (state.status === "success") {
      showToast({ message: success, variant: "success" });
      setSelected(new Set());
      router.refresh();
      return;
    }
    if (state.status === "error") {
      showToast({
        message: messages[state.code] ?? state.detail ?? (nl ? "Niet gelukt." : "Failed."),
        variant: "error",
        duration: 0,
      });
      // Half gelukt is ook gewijzigd: de foto's die wél verhuisden, horen op hun
      // nieuwe plek te staan zodra de melding weg is.
      setSelected(new Set());
      router.refresh();
    }
  }

  function run(build: () => FormData, action: typeof detachPhotosAction, success: string) {
    startTransition(async () => {
      const state = await action(SAVE_IDLE, build());
      setConfirming(null);
      report(state, success);
    });
  }

  function baseForm(): FormData {
    const data = new FormData();
    data.set("slug", slug);
    data.set("fromAlbumId", activeTab?.id ?? albumId);
    data.set("assetIds", selectedIds.join(","));
    return data;
  }

  async function uploadPhotos(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0) return;
    const target = activeTab?.id ?? albumId;
    let errors = 0;
    setUploading({ done: 0, total: files.length });

    for (const [index, file] of files.entries()) {
      const data = new FormData();
      data.append("albumId", target);
      data.append("gallery", "main");
      data.append("file", file);
      try {
        const result = await uploadImmichAlbumAssetAction(data);
        if (!result.ok) errors += 1;
      } catch {
        errors += 1;
      }
      setUploading({ done: index + 1, total: files.length });
    }

    await finalizeImmichAlbumAction(new FormData());
    setUploading(null);
    setFiles([]);
    formRef.current?.reset();
    showToast({
      message:
        errors === 0
          ? nl
            ? `${files.length} foto('s) toegevoegd.`
            : `${files.length} photo(s) added.`
          : nl
            ? `${files.length - errors}/${files.length} foto's toegevoegd; ${errors} mislukt.`
            : `${files.length - errors}/${files.length} photos added; ${errors} failed.`,
      variant: errors === 0 ? "success" : "error",
      duration: errors === 0 ? undefined : 0,
    });
    router.refresh();
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 font-semibold">{nl ? "Foto's" : "Photos"}</h2>
      <p className="mb-3 text-sm text-zinc-500">
        {nl
          ? "Klik foto's aan om ze te verplaatsen, uit het album te halen of weg te gooien."
          : "Click photos to move them, take them out of the album or throw them away."}
      </p>

      {hasTabs ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveId(tab.id);
                setSelected(new Set());
              }}
              className={[
                "rounded-full border px-3 py-1 text-sm transition-colors",
                tab.id === activeId
                  ? "border-vtk-blue/30 bg-vtk-blue-soft/70 font-semibold text-vtk-ink"
                  : "border-vtk-blue/15 text-zinc-600 hover:bg-vtk-blue-soft/40",
              ].join(" ")}
            >
              {tab.title} ({tab.photos.length})
            </button>
          ))}
        </div>
      ) : null}

      {selectedIds.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-vtk-blue/15 bg-vtk-blue-soft/40 px-3 py-2 text-sm">
          <span className="font-semibold">
            {selectedIds.length} {nl ? "geselecteerd" : "selected"}
          </span>

          {hasTabs ? (
            <>
              <select
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                value={moveTarget}
                onChange={(event) => setMoveTarget(event.target.value)}
              >
                <option value="">{nl ? "Verplaats naar tab…" : "Move to tab…"}</option>
                {tabs
                  .filter((tab) => tab.id !== activeTab?.id)
                  .map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.title}
                    </option>
                  ))}
              </select>
              <Button
                type="button"
                size="sm"
                disabled={!moveTarget || pending}
                onClick={() =>
                  run(
                    () => {
                      const data = baseForm();
                      data.set("toAlbumId", moveTarget);
                      return data;
                    },
                    movePhotosToTabAction,
                    nl ? "Foto's verplaatst." : "Photos moved.",
                  )
                }
              >
                {nl ? "Verplaatsen" : "Move"}
              </Button>
            </>
          ) : null}

          {selectedIds.length === 1 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(
                  () => {
                    const data = new FormData();
                    data.set("albumId", albumId);
                    data.set("assetId", selectedIds[0]);
                    return data;
                  },
                  setAlbumCoverAction,
                  nl ? "Cover ingesteld." : "Cover set.",
                )
              }
            >
              {nl ? "Als cover" : "Set as cover"}
            </Button>
          ) : null}

          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming("detach")}>
            {nl ? "Uit het album halen" : "Take out of the album"}
          </Button>
          <Button type="button" size="sm" variant="danger" disabled={pending} onClick={() => setConfirming("trash")}>
            {nl ? "Naar de prullenmand" : "Move to trash"}
          </Button>
          <button
            type="button"
            className="ml-auto text-xs text-zinc-500 underline"
            onClick={() => setSelected(new Set())}
          >
            {nl ? "Selectie wissen" : "Clear selection"}
          </button>
        </div>
      ) : null}

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {(activeTab?.photos ?? []).map((photo) => {
          const isSelected = selected.has(photo.id);
          return (
            <li key={photo.id} className="relative">
              <button
                type="button"
                onClick={() => toggle(photo.id)}
                aria-pressed={isSelected}
                className={[
                  "block w-full overflow-hidden rounded-lg border transition-colors",
                  isSelected ? "border-vtk-blue ring-2 ring-vtk-yellow" : "border-vtk-blue/15",
                ].join(" ")}
                title={photo.title}
              >
                {/* De duimnagel komt van de publieke Immich-proxy, op een host die
                    niet in next.config.ts staat; zie AlbumViewer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumbnailUrl}
                  alt={photo.title}
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-full object-cover"
                />
              </button>
              {photo.id === coverPhotoId ? (
                <span className="absolute left-1 top-1 rounded bg-vtk-yellow px-1.5 py-0.5 text-[10px] font-semibold uppercase text-vtk-ink">
                  Cover
                </span>
              ) : null}
              {isSelected ? (
                <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-vtk-ink text-xs text-white">
                  ✓
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {(activeTab?.photos.length ?? 0) === 0 ? (
        <p className="text-sm text-zinc-500">
          {nl ? "Deze tab staat nog leeg." : "This tab is still empty."}
        </p>
      ) : null}

      <form ref={formRef} onSubmit={uploadPhotos} className="mt-4 border-t border-zinc-200 pt-4">
        <Label>
          {hasTabs
            ? nl
              ? `Foto's toevoegen aan "${activeTab?.title}"`
              : `Add photos to "${activeTab?.title}"`
            : nl
              ? "Foto's toevoegen"
              : "Add photos"}
        </Label>
        <FileField
          accept="image/*,video/*"
          multiple
          locale={nl ? "nl" : "en"}
          chooseLabel={nl ? "Foto's kiezen" : "Choose photos"}
          onChange={(list) => setFiles(list ? Array.from(list) : [])}
        />
        <div className="mt-2">
          <Button type="submit" size="sm" disabled={files.length === 0 || Boolean(uploading)}>
            {uploading
              ? `${uploading.done}/${uploading.total}`
              : nl
                ? "Uploaden"
                : "Upload"}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirming === "detach"}
        title={nl ? "Foto's uit het album halen?" : "Take photos out of the album?"}
        description={
          nl
            ? `${selectedIds.length} foto('s) verdwijnen van de site maar blijven in Immich staan. Je vindt ze terug onderaan deze pagina en kan ze daar terugzetten.`
            : `${selectedIds.length} photo(s) disappear from the site but stay in Immich. You find them at the bottom of this page and can put them back there.`
        }
        confirmLabel={nl ? "Uit het album halen" : "Take out"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        destructive={false}
        pending={pending}
        onCancel={() => setConfirming(null)}
        onConfirm={() =>
          run(baseForm, detachPhotosAction, nl ? "Foto's uit het album gehaald." : "Photos taken out of the album.")
        }
      />

      <ConfirmDialog
        open={confirming === "trash"}
        title={nl ? "Foto's naar de prullenmand?" : "Move photos to the trash?"}
        description={
          nl
            ? `${selectedIds.length} foto('s) gaan naar de prullenmand van Immich. Ze zijn meteen van de site weg; Immich ruimt ze na een maand definitief op, tot dan kan een beheerder ze daar terughalen.`
            : `${selectedIds.length} photo(s) go to Immich's trash. They leave the site right away; Immich deletes them for good after a month, until then an administrator can restore them there.`
        }
        confirmLabel={nl ? "Naar de prullenmand" : "Move to trash"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onCancel={() => setConfirming(null)}
        onConfirm={() =>
          run(
            () => {
              const data = new FormData();
              data.set("assetIds", selectedIds.join(","));
              return data;
            },
            trashPhotosAction,
            nl ? "Foto's naar de prullenmand." : "Photos moved to the trash.",
          )
        }
      />
    </Card>
  );
}
