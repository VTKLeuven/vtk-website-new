"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@vtk/ui";
import { FileField } from "@/components/ui/FileField";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import {
  createImmichAlbumAction,
  finalizeImmichAlbumAction,
  setImmichAlbumCoverAction,
  uploadImmichAlbumAssetAction,
} from "@/app/actions/media";

type Progress = { total: number; done: number; errors: number; label: string };

/**
 * Hoe een album gemaakt wordt.
 *
 * - `single`: één album, zoals het altijd was.
 * - `tabs`: één evenement met meerdere tabs, elk met hun eigen foto's. Elke tab
 *   is een eigen Immich-album; de eerste is het hoofdalbum en de rest hangt
 *   eraan met `[parent:]`.
 * - `attach`: een tab aan een bestaand album hangen.
 */
type Mode = "single" | "tabs" | "attach";

type TabBlock = { key: string; name: string; files: File[] };

function emptyBlock(): TabBlock {
  return { key: Math.random().toString(36).slice(2), name: "", files: [] };
}

export function ImmichAlbumUploader({
  locale,
  fakbarEnabled = false,
  albums = [],
  albumsError = false,
}: {
  locale: "nl" | "en";
  /**
   * Of de fakbargalerij als bestemming gekozen mag worden. Staat standaard uit;
   * de schakelaar staat op deze pagina en de server hertoetst hem sowieso (zie
   * lib/fakbar-gallery.ts).
   */
  fakbarEnabled?: boolean;
  albums?: Array<{ slug: string; title: string; hasTabName?: boolean }>;
  /**
   * Immich gaf de albumlijst niet terug. Zonder die lijst kan je geen
   * hoofdalbum kiezen, maar de optie blijft zichtbaar met uitleg: een blok dat
   * zichzelf verbergt ziet eruit als een feature die niet gedeployd is.
   */
  albumsError?: boolean;
}) {
  const nl = locale === "nl";
  const canPickParent = albums.length > 0;
  const [gallery, setGallery] = useState<"main" | "fakbar">("main");
  const [mode, setMode] = useState<Mode>("single");
  const [blocks, setBlocks] = useState<TabBlock[]>([emptyBlock()]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [parentSlug, setParentSlug] = useState("");
  const [parentTabName, setParentTabName] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const effectiveMode: Mode = gallery === "fakbar" ? "single" : mode;
  const parentAlbum = albums.find((album) => album.slug === parentSlug) || null;
  const needsParentTabName = effectiveMode === "attach" && parentAlbum?.hasTabName === false;

  function setBlock(key: string, patch: Partial<TabBlock>) {
    setBlocks((current) => current.map((block) => (block.key === key ? { ...block, ...patch } : block)));
  }

  function selectFiles(key: string, list: FileList | null) {
    const next = list ? Array.from(list) : [];
    setBlock(key, { files: next });
    // De cover hangt aan het hoofdalbum, dus enkel het eerste blok stelt ze in.
    if (blocks[0]?.key === key) {
      const firstImage = next.findIndex((file) => file.type.startsWith("image/"));
      setCoverIndex(firstImage >= 0 ? firstImage : 0);
    }
  }

  function resetForm(form: HTMLFormElement) {
    setBlocks([emptyBlock()]);
    setCoverIndex(0);
    setMode("single");
    setParentSlug("");
    setParentTabName("");
    form.reset();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    // De bestemming komt uit de state, niet uit een veld dat ook zonder de
    // schakelaar meegestuurd zou kunnen worden.
    const target = fakbarEnabled ? gallery : "main";
    data.set("gallery", target);

    const title = String(data.get("title") || "").trim();
    const description = String(data.get("description") || "").trim();

    if (effectiveMode === "attach" && !parentSlug) {
      setError(nl ? "Kies het album waar deze tab bij hoort." : "Pick the album this tab belongs to.");
      return;
    }
    if (effectiveMode !== "single" && blocks.some((block) => !block.name.trim())) {
      setError(nl ? "Geef elke tab een naam." : "Give every tab a name.");
      return;
    }
    if (blocks.every((block) => block.files.length === 0)) {
      setError(nl ? "Kies eerst foto's om te uploaden." : "Pick photos to upload first.");
      return;
    }

    const totalFiles = blocks.reduce((sum, block) => sum + block.files.length, 0);
    let done = 0;
    let errors = 0;
    let coverAssetId: string | null = null;
    let firstAlbumId: string | null = null;

    for (const [index, block] of blocks.entries()) {
      const isFirst = index === 0;
      const tabName = block.name.trim();

      const albumData = new FormData();
      albumData.set("gallery", target);
      albumData.set("description", isFirst ? description : "");

      if (effectiveMode === "attach") {
        albumData.set("title", `${parentAlbum?.title || title}: ${tabName}`);
        albumData.set("parentSlug", parentSlug);
        albumData.set("tabName", tabName);
        if (parentTabName.trim()) albumData.set("parentTabName", parentTabName.trim());
      } else if (effectiveMode === "tabs") {
        albumData.set("title", isFirst ? title : `${title}: ${tabName}`);
        albumData.set("tabName", tabName);
        // De groepering slugificeert deze waarde zelf, dus de titel van het
        // hoofdalbum volstaat als verwijzing.
        if (!isFirst) albumData.set("parentSlug", title);
      } else {
        albumData.set("title", title);
      }

      const created = await createImmichAlbumAction(albumData);
      if (!created.ok || !created.albumId) {
        setProgress(null);
        setError(
          created.error === "missing_title"
            ? nl
              ? "Geef het album een titel."
              : "Give the album a title."
            : created.error === "fakbar_upload_disabled"
              ? nl
                ? "Uploaden naar de fakbargalerij staat uit. Zet het hierboven aan."
                : "Uploading to the fakbar gallery is switched off. Enable it above."
              : nl
                ? "Immich is niet bereikbaar. Probeer later opnieuw."
                : "Immich is unreachable. Try again later."
        );
        return;
      }
      if (isFirst) firstAlbumId = created.albumId;

      const assetIds: Array<string | null> = [];
      for (const file of block.files) {
        const uploadData = new FormData();
        uploadData.append("albumId", created.albumId);
        uploadData.append("gallery", target);
        uploadData.append("file", file);
        try {
          const result = await uploadImmichAlbumAssetAction(uploadData);
          assetIds.push(result.ok && result.assetId ? result.assetId : null);
          if (!result.ok) errors += 1;
        } catch {
          assetIds.push(null);
          errors += 1;
        }
        done += 1;
        setProgress({
          total: totalFiles,
          done,
          errors,
          label: effectiveMode === "single" ? "" : tabName,
        });
      }

      if (isFirst) {
        coverAssetId = assetIds[coverIndex] ?? assetIds.find((id) => id !== null) ?? null;
      }
    }

    // De cover staat op het hoofdalbum: de mediapagina toont de cover van het
    // album waar de tabs aan hangen, niet die van een tab.
    let coverFailed = false;
    if (firstAlbumId && coverAssetId && effectiveMode !== "attach") {
      const coverData = new FormData();
      coverData.append("albumId", firstAlbumId);
      coverData.append("assetId", coverAssetId);
      try {
        const coverResult = await setImmichAlbumCoverAction(coverData);
        coverFailed = !coverResult.ok;
      } catch {
        coverFailed = true;
      }
    }

    const finalizeData = new FormData();
    finalizeData.set("gallery", target);
    await finalizeImmichAlbumAction(finalizeData);
    setProgress(null);
    resetForm(form);

    const base =
      errors === 0
        ? nl
          ? `Album aangemaakt met ${done} foto's. Het verschijnt binnen een minuut op de mediapagina.`
          : `Album created with ${done} photos. It appears on the media page within a minute.`
        : nl
          ? `Album aangemaakt; ${done - errors}/${done} foto's gelukt (${errors} mislukt).`
          : `Album created; ${done - errors}/${done} photos succeeded (${errors} failed).`;
    setMessage(
      coverFailed
        ? `${base} ${nl ? "De cover kon niet ingesteld worden." : "The cover could not be set."}`
        : base
    );
    startTransition(() => router.refresh());
  }

  const modeLabels: Record<Mode, string> = nl
    ? {
        single: "Eén album",
        tabs: "Album met tabs",
        attach: "Tab aan een bestaand album",
      }
    : {
        single: "One album",
        tabs: "Album with tabs",
        attach: "Tab on an existing album",
      };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {gallery === "main" ? (
        <div className="md:col-span-2">
          <Label>{nl ? "Wat maak je" : "What are you making"}</Label>
          <div className="flex flex-wrap gap-4 text-sm">
            {(["single", "tabs", "attach"] as const).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="albumMode"
                  checked={mode === value}
                  disabled={value === "attach" && !canPickParent}
                  onChange={() => {
                    setMode(value);
                    if (value === "attach" && !parentSlug && albums[0]) setParentSlug(albums[0].slug);
                    if (value !== "single" && blocks.length === 1 && !blocks[0].name) {
                      setBlocks([{ ...blocks[0] }]);
                    }
                  }}
                />
                <span className={value === "attach" && !canPickParent ? "text-zinc-400" : ""}>
                  {modeLabels[value]}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {nl
              ? "Een album met tabs is één evenement met meerdere fotosets (Zaal, Photobooth, Receptie). Elke tab krijgt zijn eigen naam op de mediapagina."
              : "An album with tabs is one event with several photo sets (hall, photobooth, reception). Each tab gets its own name on the media page."}
          </p>
          {!canPickParent ? (
            <p className="mt-1 text-xs text-zinc-500">
              {albumsError
                ? nl
                  ? "Immich is nu niet bereikbaar, dus de bestaande albums kunnen niet opgehaald worden. Je kan wel een nieuw album aanmaken."
                  : "Immich is unreachable right now, so the existing albums cannot be loaded. You can still create a new album."
                : nl
                  ? "Er staat nog geen album op de mediapagina, dus er is nog niets om een tab aan te hangen."
                  : "There is no album on the media page yet, so there is nothing to attach a tab to."}
            </p>
          ) : null}
        </div>
      ) : null}

      {effectiveMode === "attach" ? (
        <>
          <div>
            <Label>{nl ? "Album (evenement)" : "Album (event)"}</Label>
            <select
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={parentSlug}
              onChange={(event) => setParentSlug(event.target.value)}
            >
              {albums.map((album) => (
                <option key={album.slug} value={album.slug}>
                  {album.title} ({album.slug})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>
              {nl ? "Tabnaam van het bestaande album" : "Tab name of the existing album"}
            </Label>
            <Input
              value={parentTabName}
              onChange={(event) => setParentTabName(event.target.value)}
              placeholder={nl ? "Zaal" : "Hall"}
              maxLength={50}
              disabled={!needsParentTabName}
            />
            <p className="mt-1 text-xs text-zinc-500">
              {needsParentTabName
                ? nl
                  ? "De foto's die er al in staan krijgen deze tabnaam. Laat je dit leeg, dan heet die tab \"Algemeen\"."
                  : "The photos already in there get this tab name. Leave it empty and that tab is called \"Algemeen\"."
                : nl
                  ? "Dit album heeft al een tabnaam; die pas je aan op de beheerpagina van het album."
                  : "This album already has a tab name; change it on the album's admin page."}
            </p>
          </div>
        </>
      ) : (
        <>
          <div>
            <Label>{nl ? "Albumtitel" : "Album title"}</Label>
            <Input name="title" required maxLength={200} />
          </div>
          <div>
            <Label>{nl ? "Beschrijving (optioneel)" : "Description (optional)"}</Label>
            <Input name="description" maxLength={1000} />
          </div>
        </>
      )}

      {fakbarEnabled ? (
        <div className="md:col-span-2">
          <Label>{nl ? "Naar welke galerij" : "Which gallery"}</Label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="galleryChoice"
                checked={gallery === "main"}
                onChange={() => setGallery("main")}
              />
              <span>{nl ? "Fotogalerij van vtk.be" : "vtk.be photo gallery"}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="galleryChoice"
                checked={gallery === "fakbar"}
                onChange={() => setGallery("fakbar")}
              />
              <span>{nl ? "Fotogalerij van 't ElixIr" : "'t ElixIr photo gallery"}</span>
            </label>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {nl
              ? "Een album staat in één van de twee, nooit in allebei. De fakbargalerij werkt zonder tabs."
              : "An album lives in one of the two, never in both. The fakbar gallery has no tabs."}
          </p>
        </div>
      ) : null}

      {blocks.map((block, index) => (
        <div
          key={block.key}
          className={
            effectiveMode === "single"
              ? "md:col-span-2"
              : "md:col-span-2 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3"
          }
        >
          {effectiveMode !== "single" ? (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label>
                  {nl ? `Tabnaam ${index + 1}` : `Tab name ${index + 1}`}
                </Label>
                <Input
                  value={block.name}
                  onChange={(event) => setBlock(block.key, { name: event.target.value })}
                  placeholder={index === 0 ? (nl ? "Zaal" : "Hall") : "Photobooth"}
                  maxLength={50}
                />
              </div>
              {blocks.length > 1 ? (
                <IconButton
                  tone="danger"
                  label={nl ? "Tab verwijderen" : "Remove tab"}
                  srLabel={
                    nl
                      ? `Tab verwijderen: ${block.name || index + 1}`
                      : `Remove tab: ${block.name || index + 1}`
                  }
                  onClick={() => setBlocks((current) => current.filter((item) => item.key !== block.key))}
                >
                  <TrashIcon />
                </IconButton>
              ) : null}
            </div>
          ) : null}

          <div>
            <Label>{nl ? "Foto's" : "Photos"}</Label>
            <FileField
              accept="image/*,video/*"
              multiple
              locale={locale}
              chooseLabel={nl ? "Foto's kiezen" : "Choose photos"}
              hint={nl ? "Afbeeldingen en video's." : "Images and videos."}
              onChange={(files) => selectFiles(block.key, files)}
            />
          </div>

          {index === 0 && block.files.length > 0 && effectiveMode !== "attach" ? (
            <div>
              <Label>{nl ? "Coverfoto" : "Cover photo"}</Label>
              <p className="mb-1 text-xs text-zinc-500">
                {nl
                  ? "Kies welke foto de albumcover wordt (ook zichtbaar in Immich)."
                  : "Choose which photo becomes the album cover (also visible in Immich)."}
              </p>
              <ul className="max-h-48 overflow-y-auto rounded-md border border-zinc-200 divide-y divide-zinc-100">
                {block.files.map((file, fileIndex) => {
                  const selectable = file.type.startsWith("image/");
                  return (
                    <li key={`${file.name}-${fileIndex}`}>
                      <label className="flex items-center gap-2 px-3 py-1.5 text-sm">
                        <input
                          type="radio"
                          name="coverChoice"
                          checked={coverIndex === fileIndex}
                          disabled={!selectable}
                          onChange={() => setCoverIndex(fileIndex)}
                        />
                        <span className={selectable ? "" : "text-zinc-400"}>
                          {file.name}
                          {!selectable ? " (video)" : ""}
                        </span>
                        {coverIndex === fileIndex ? (
                          <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold uppercase">
                            Cover
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ))}

      {effectiveMode === "tabs" ? (
        <div className="md:col-span-2">
          <Button type="button" variant="ghost" onClick={() => setBlocks((current) => [...current, emptyBlock()])}>
            {nl ? "Tab toevoegen" : "Add tab"}
          </Button>
        </div>
      ) : null}

      <div className="md:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={Boolean(progress)}>
          {progress
            ? `${progress.label ? `${progress.label}: ` : ""}${progress.done}/${progress.total}${
                progress.errors ? ` (${progress.errors} err)` : ""
              }`
            : effectiveMode === "attach"
              ? nl
                ? "Tab toevoegen en uploaden"
                : "Add tab and upload"
              : nl
                ? "Album aanmaken en uploaden"
                : "Create album and upload"}
        </Button>
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </form>
  );
}
