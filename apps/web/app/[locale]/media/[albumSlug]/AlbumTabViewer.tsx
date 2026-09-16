"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlbumViewer } from "./AlbumViewer";
import type { ComponentProps } from "react";

type AlbumViewerProps = ComponentProps<typeof AlbumViewer>;
type Photo = AlbumViewerProps["photos"][number];
type Labels = AlbumViewerProps["labels"];

export type SubAlbumData = {
  id: string;
  slug: string;
  title: string;
  photoCount: number;
  photos: Photo[];
};

export function AlbumTabViewer({
  albumSlug,
  subAlbums,
  labels,
}: {
  albumSlug: string;
  subAlbums: SubAlbumData[];
  labels: Labels;
}) {
  const searchParams = useSearchParams();
  const subParam = searchParams.get("sub");

  const [userSelectedSlug, setUserSelectedSlug] = useState<string | null>(null);

  const activeSlug =
    (userSelectedSlug && subAlbums.some((s) => s.slug === userSelectedSlug) ? userSelectedSlug : null) ??
    (subParam && subAlbums.some((s) => s.slug === subParam) ? subParam : null) ??
    subAlbums[0]?.slug ??
    "";

  const selectTab = useCallback((slug: string) => {
    setUserSelectedSlug(slug);
    const url = new URL(window.location.href);
    url.searchParams.set("sub", slug);
    window.history.replaceState(null, "", url.toString());
  }, []);

  const activeSub =
    subAlbums.find((s) => s.slug === activeSlug) || subAlbums[0];

  if (!activeSub) return null;

  return (
    <div className="vtk-album-tab-section">
      <div role="tablist" aria-label="Sub-albums" className="vtk-album-tabs">
        {subAlbums.map((sub) => {
          const isActive = sub.slug === activeSub.slug;
          return (
            <button
              key={sub.slug}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={`vtk-album-tab ${isActive ? "is-active" : ""}`}
              onClick={() => selectTab(sub.slug)}
            >
              <span>{sub.title}</span>
              <span className="vtk-album-tab-count">{sub.photoCount}</span>
            </button>
          );
        })}
      </div>

      <AlbumViewer
        key={activeSub.slug}
        albumSlug={albumSlug}
        photos={activeSub.photos}
        labels={labels}
      />
    </div>
  );
}
