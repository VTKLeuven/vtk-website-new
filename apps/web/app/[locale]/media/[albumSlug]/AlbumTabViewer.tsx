"use client";

import { useCallback, useId, useRef, useState, type ComponentProps, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { AlbumViewer } from "./AlbumViewer";

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
  albumTitle,
  subAlbumsLabel = "Sub-albums",
  subAlbums,
  labels,
}: {
  albumSlug: string;
  albumTitle?: string;
  subAlbumsLabel?: string;
  subAlbums: SubAlbumData[];
  labels: Labels;
}) {
  const searchParams = useSearchParams();
  const subParam = searchParams.get("sub");
  const tabsId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

  const activeIndex = Math.max(
    0,
    subAlbums.findIndex((s) => s.slug === activeSlug)
  );
  const activeSub = subAlbums[activeIndex] ?? subAlbums[0];

  if (!activeSub) return null;

  const panelId = `${tabsId}-panel`;
  const activeTabId = `${tabsId}-tab-${activeIndex}`;

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % subAlbums.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + subAlbums.length) % subAlbums.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = subAlbums.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextSub = subAlbums[nextIndex];
    if (!nextSub) return;

    selectTab(nextSub.slug);
    const nextButton = tabRefs.current[nextIndex];
    nextButton?.focus();
    nextButton?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  return (
    <div className="vtk-album-tab-section">
      <div role="tablist" aria-label={subAlbumsLabel} className="vtk-album-tabs">
        {subAlbums.map((sub, index) => {
          const isActive = sub.slug === activeSub.slug;
          return (
            <button
              key={sub.slug}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={`${tabsId}-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              className={`vtk-album-tab ${isActive ? "is-active" : ""}`}
              onClick={() => selectTab(sub.slug)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <span>{sub.title}</span>
              <span className="vtk-album-tab-count">{sub.photoCount}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={activeTabId}
        tabIndex={0}
        className="vtk-album-tabpanel"
      >
        <AlbumViewer
          key={activeSub.slug}
          albumSlug={albumSlug}
          albumTitle={albumTitle ? `${albumTitle} - ${activeSub.title}` : activeSub.title}
          photos={activeSub.photos}
          labels={labels}
        />
      </div>
    </div>
  );
}
