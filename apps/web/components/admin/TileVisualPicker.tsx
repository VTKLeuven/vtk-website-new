"use client";

import { useMemo, useRef, useState } from "react";
import {
  TILE_ICONS,
  TILE_ICON_CATEGORIES,
  TileIcon,
  tileImageUrl,
  type TileIconCategory,
} from "@/lib/dashboard-tiles";

type Loc = "nl" | "en";

const T = {
  nl: {
    visual: "Beeld",
    tabIcon: "Pictogram",
    tabImage: "Afbeelding",
    search: "Zoek een pictogram…",
    all: "Alles",
    noResults: (q: string) => `Geen pictogram gevonden voor "${q}".`,
    choose: "Afbeelding kiezen",
    replace: "Vervangen",
    remove: "Verwijderen",
    uploading: "Bezig met uploaden…",
    hint: "PNG of SVG, tot 2 MB. Transparantie blijft behouden.",
    empty: "Nog geen afbeelding. Kies er een, of blijf bij een pictogram.",
    failed: "Upload mislukt; de afbeelding is niet bewaard.",
    tooLarge: "Die afbeelding is groter dan 2 MB; kies een kleinere.",
  },
  en: {
    visual: "Visual",
    tabIcon: "Icon",
    tabImage: "Image",
    search: "Search an icon…",
    all: "All",
    noResults: (q: string) => `No icon found for "${q}".`,
    choose: "Choose image",
    replace: "Replace",
    remove: "Remove",
    uploading: "Uploading…",
    hint: "PNG or SVG, up to 2 MB. Transparency is preserved.",
    empty: "No image yet. Pick one, or stay with an icon.",
    failed: "Upload failed; the image was not saved.",
    tooLarge: "That image is larger than 2 MB; pick a smaller one.",
  },
} as const;

/**
 * Het beeldveld van een dashboardtegel: ofwel een pictogram uit de gecureerde
 * set, ofwel een eigen logo. De twee staan bewust op aparte tabbladen; met bijna
 * negentig pictogrammen en een zoekveld erboven zou een uploadvak dat tussen de
 * pictogrammen staat wegscrollen zodra je begint te zoeken.
 *
 * Het pictogram blijft bewaard terwijl er een afbeelding staat: haal je de
 * afbeelding weg, dan valt de tegel terug op het pictogram in plaats van leeg
 * te worden.
 */
export function TileVisualPicker({
  locale,
  icon,
  imageKey,
  onIconChange,
  onImageChange,
}: {
  locale: Loc;
  icon: string;
  imageKey: string | null;
  onIconChange: (icon: string) => void;
  onImageChange: (key: string | null) => void;
}) {
  const t = T[locale];
  const nl = locale === "nl";
  const [tab, setTab] = useState<"icon" | "image">(imageKey ? "image" : "icon");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<TileIconCategory | "">("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TILE_ICONS.filter((i) => {
      if (cat && i.cat !== cat) return false;
      if (!q) return true;
      return `${i.key} ${i.labelNl} ${i.labelEn}`.toLowerCase().includes(q);
    });
  }, [query, cat]);

  async function upload(file: File) {
    setError(null);
    if (file.size > 2 * 1024 * 1024) {
      setError(t.tooLarge);
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "tile");
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      if (!res.ok) {
        setError(res.status === 413 ? t.tooLarge : t.failed);
        return;
      }
      const data = (await res.json()) as { key: string };
      onImageChange(data.key);
    } catch {
      setError(t.failed);
    } finally {
      setUploading(false);
      // Anders weigert de browser hetzelfde bestand opnieuw: de waarde
      // verandert niet en `change` vuurt niet.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="vtk-tile-field">
      <span>{t.visual}</span>

      <div className="vtk-tile-seg" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "icon"}
          onClick={() => setTab("icon")}
        >
          {t.tabIcon}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "image"}
          onClick={() => setTab("image")}
        >
          {t.tabImage}
        </button>
      </div>

      {tab === "icon" ? (
        <div className="vtk-icon-picker">
          <input
            className="vtk-icon-search"
            type="search"
            value={query}
            placeholder={t.search}
            aria-label={t.search}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="vtk-icon-cats">
            <button
              type="button"
              aria-pressed={cat === ""}
              onClick={() => setCat("")}
            >
              {t.all}
            </button>
            {TILE_ICON_CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={cat === c.key}
                onClick={() => setCat(c.key)}
              >
                {nl ? c.labelNl : c.labelEn}
              </button>
            ))}
          </div>
          {results.length === 0 ? (
            <p className="vtk-tiles-hint">{t.noResults(query.trim())}</p>
          ) : (
            <div className="vtk-icon-grid">
              {results.map((i) => (
                <button
                  key={i.key}
                  type="button"
                  className={"vtk-icon-opt" + (icon === i.key ? " is-active" : "")}
                  title={nl ? i.labelNl : i.labelEn}
                  aria-label={nl ? i.labelNl : i.labelEn}
                  aria-pressed={icon === i.key}
                  onClick={() => {
                    onIconChange(i.key);
                    // Een pictogram kiezen is ook zeggen "toon geen logo meer";
                    // anders klik je en verandert er niets zichtbaars.
                    onImageChange(null);
                  }}
                >
                  <TileIcon name={i.key} size={20} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="vtk-tile-upload">
          <div className="vtk-tile-upload-thumb">
            {imageKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tileImageUrl(imageKey)} alt="" />
            ) : (
              <TileIcon name={icon} size={24} />
            )}
          </div>
          <div className="vtk-tile-upload-body">
            <div className="vtk-tile-upload-actions">
              <label className={"vtk-tile-btn" + (uploading ? " is-pending" : "")}>
                {uploading ? t.uploading : imageKey ? t.replace : t.choose}
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg,image/webp"
                  disabled={uploading}
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f);
                  }}
                />
              </label>
              {imageKey && !uploading && (
                <button
                  type="button"
                  className="vtk-tile-btn"
                  onClick={() => {
                    onImageChange(null);
                    setError(null);
                  }}
                >
                  {t.remove}
                </button>
              )}
            </div>
            <p className="vtk-tiles-hint">{imageKey ? t.hint : t.empty}</p>
            {error && <p className="vtk-tile-error">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
