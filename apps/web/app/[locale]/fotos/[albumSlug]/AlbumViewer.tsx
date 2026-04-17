"use client";

import { useState } from "react";
import { Button } from "@vtk/ui";

type Photo = { id: string; thumb: string; full: string };

export function AlbumViewer({
  albumSlug,
  photos,
  labels,
}: {
  albumSlug: string;
  photos: Photo[];
  labels: { downloadSelected: string; downloadAll: string; selected: string };
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<number | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadAll() {
    window.location.href = `/api/albums/${albumSlug}/download`;
  }

  function downloadSelected() {
    if (selected.size === 0) return;
    const params = Array.from(selected)
      .map((id) => `ids=${encodeURIComponent(id)}`)
      .join("&");
    window.location.href = `/api/albums/${albumSlug}/download?${params}`;
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-sm text-zinc-500">
          {selected.size} {labels.selected}
        </span>
        <Button onClick={downloadSelected} disabled={selected.size === 0} size="sm">
          {labels.downloadSelected}
        </Button>
        <Button onClick={downloadAll} size="sm" variant="secondary">
          {labels.downloadAll}
        </Button>
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {photos.map((p, i) => (
          <li key={p.id} className="relative group">
            <button
              type="button"
              onClick={() => setLightbox(i)}
              className="block aspect-square w-full overflow-hidden rounded bg-zinc-200 focus:outline-vtk-blue"
            >
              <img src={p.thumb} alt="" className="h-full w-full object-cover group-hover:scale-105 transition" />
            </button>
            <label className="absolute top-2 left-2 rounded bg-white/95 p-1 shadow">
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={(e) => {
                  e.stopPropagation();
                  toggle(p.id);
                }}
              />
            </label>
          </li>
        ))}
      </ul>

      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl"
            onClick={() => setLightbox(null)}
          >
            ×
          </button>
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox((i) => (i! > 0 ? i! - 1 : photos.length - 1));
            }}
          >
            ‹
          </button>
          <img
            src={photos[lightbox].full}
            alt=""
            className="max-h-full max-w-full"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox((i) => (i! < photos.length - 1 ? i! + 1 : 0));
            }}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
