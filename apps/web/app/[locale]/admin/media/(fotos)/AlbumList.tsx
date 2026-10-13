"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { EyeOff, Plus, Trash2 } from "lucide-react";
import Link from "@/components/ui/Link";
import { adminThumbnailUrl } from "@/lib/media-admin-shared";
import { useUploads } from "./uploads";
import type { LibraryRow } from "./types";

type Filter = "all" | "on" | "off";

/**
 * De lijst van alle albums, links naast het open album.
 *
 * Gegroepeerd per werkingsjaar, met een zoekveld en een filter op zichtbaar of
 * verborgen: 144 albums als lange lijst van titels was precies waarom je in het
 * oude beheer zo moest scrollen. De lijst scrolt in haar eigen kolom, zodat het
 * album rechts blijft staan.
 */
export function AlbumList({
  locale,
  rows,
  error,
  trashCount,
  onNewAlbum,
}: {
  locale: string;
  rows: LibraryRow[];
  error: boolean;
  trashCount: number;
  onNewAlbum: () => void;
}) {
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/media`;
  const segments = useSelectedLayoutSegments();
  const activeId = segments[0] === "albums" ? decodeURIComponent(segments[1] ?? "") : null;
  const inTrash = segments[0] === "prullenmand";
  const { jobs } = useUploads();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const listRef = useRef<HTMLDivElement>(null);

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", { day: "numeric", month: "short", year: "numeric" }),
    [nl],
  );
  const numberFormat = useMemo(() => new Intl.NumberFormat(nl ? "nl-BE" : "en-GB"), [nl]);

  const hiddenCount = rows.filter((row) => row.hidden).length;
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const shown = rows.filter((row) => {
      if (filter === "on" && row.hidden) return false;
      if (filter === "off" && !row.hidden) return false;
      return !needle || row.title.toLowerCase().includes(needle);
    });
    const out: Array<{ key: string; label: string; rows: LibraryRow[] }> = [];
    for (const row of shown) {
      const key = row.workingYear === null ? "none" : String(row.workingYear);
      const label =
        row.workingYear === null ? (nl ? "Zonder datum" : "No date") : `${row.workingYear}-${row.workingYear + 1}`;
      const last = out[out.length - 1];
      if (last?.key === key) last.rows.push(row);
      else out.push({ key, label, rows: [row] });
    }
    return out;
  }, [rows, query, filter, nl]);

  // Het open album in beeld houden, maar enkel binnen de lijst: een
  // `scrollIntoView` zou ook de pagina zelf verschuiven.
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !row) return;
    const top = row.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top - list.clientHeight / 3);
    }
  }, [activeId]);

  const filters: Array<{ value: Filter; label: string; count: number }> = [
    { value: "all", label: nl ? "Alle" : "All", count: rows.length },
    { value: "on", label: nl ? "Op de site" : "On the site", count: rows.length - hiddenCount },
    { value: "off", label: nl ? "Verborgen" : "Hidden", count: hiddenCount },
  ];

  return (
    <aside className="media-library-list" aria-label={nl ? "Albums" : "Albums"}>
      <div className="media-library-list-head">
        <button type="button" className="ticket-admin-button" data-variant="primary" onClick={onNewAlbum}>
          <Plus aria-hidden="true" size={15} />
          {nl ? "Nieuw album" : "New album"}
        </button>
        <input
          type="search"
          className="ticket-admin-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={nl ? `Zoek in ${rows.length} albums` : `Search ${rows.length} albums`}
          aria-label={nl ? "Zoek een album" : "Search an album"}
        />
        <div className="media-chips" role="group" aria-label={nl ? "Toon" : "Show"}>
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              className="media-chip"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
              <span className="num">{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="media-library-albums" ref={listRef}>
        {error ? (
          <p className="media-library-note">
            {nl
              ? "De albums konden niet geladen worden: de fotobibliotheek is niet bereikbaar. Probeer straks opnieuw."
              : "The albums could not be loaded: the photo library is unreachable. Try again later."}
          </p>
        ) : groups.length === 0 ? (
          <p className="media-library-note">
            {rows.length === 0
              ? nl
                ? "Nog geen albums. Begin met Nieuw album."
                : "No albums yet. Start with New album."
              : nl
                ? "Geen albums die hierbij passen."
                : "No albums match."}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="media-library-year">
              <h3>{group.label}</h3>
              <ul>
                {group.rows.map((row) => {
                  const job = jobs.find((item) => item.albumId === row.id);
                  const active = row.id === activeId;
                  return (
                    <li key={row.id}>
                      <Link
                        href={`${base}/albums/${encodeURIComponent(row.id)}`}
                        className="media-album-row"
                        data-hidden={row.hidden ? "true" : undefined}
                        aria-current={active ? "page" : undefined}
                      >
                        {row.coverAssetId ? (
                          // Een duimnagel van de beheerroute, niet van next/image:
                          // die route vraagt een sessie en is privé gecachet.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={adminThumbnailUrl(row.coverAssetId)} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <span className="media-album-row-blank" aria-hidden="true" />
                        )}
                        <span className="media-album-row-text">
                          <span className="media-album-row-title">{row.title}</span>
                          <span className="media-album-row-meta num">
                            {job
                              ? nl
                                ? `Uploaden ${job.done}/${job.total}`
                                : `Uploading ${job.done}/${job.total}`
                              : [
                                  `${numberFormat.format(row.photoCount)} ${nl ? "foto's" : "photos"}`,
                                  row.date ? dateFormat.format(new Date(row.date)) : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                          </span>
                        </span>
                        {row.hidden ? (
                          <EyeOff
                            className="media-album-row-flag"
                            role="img"
                            aria-label={nl ? "Verborgen" : "Hidden"}
                            size={15}
                          />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      <Link
        href={`${base}/prullenmand`}
        className="media-library-trash"
        aria-current={inTrash ? "page" : undefined}
      >
        <Trash2 aria-hidden="true" size={15} />
        {nl ? "Prullenmand" : "Trash"}
        <span className="num">{trashCount}</span>
      </Link>
    </aside>
  );
}
