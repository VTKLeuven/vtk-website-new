"use client";

import { useState } from "react";
import { ExternalLink, Play, Video, VideoOff } from "lucide-react";

import { safeUrl, vimeoVideoId, youtubeVideoId } from "@/lib/videoEmbed";
import styles from "./AftermoviePlayer.module.css";

export type AftermoviePlayerItem = {
  id: string;
  title: string;
  url: string;
  posterUrl?: string | null;
  publishedLabel?: string | null;
};

export type AftermoviePlayerLabels = {
  play: string;
  unavailable: string;
  openExternal: string;
};

type NormalizedSource =
  | {
      kind: "embed";
      embedUrl: string;
      externalUrl: string;
      posterUrl: string | null;
    }
  | {
      kind: "file";
      externalUrl: string;
      mediaType: string;
      posterUrl: string | null;
    }
  | {
      kind: "external";
      externalUrl: string | null;
      posterUrl: string | null;
    };

type NormalizedItem = AftermoviePlayerItem & {
  source: NormalizedSource;
};

const DIRECT_MEDIA_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
};

function normalizeItem(item: AftermoviePlayerItem): NormalizedItem {
  const mediaUrl = safeUrl(item.url);
  const suppliedPoster = safeUrl(item.posterUrl)?.href ?? null;

  if (!mediaUrl) {
    return {
      ...item,
      source: { kind: "external", externalUrl: null, posterUrl: suppliedPoster },
    };
  }

  const youtubeId = youtubeVideoId(mediaUrl.parsed);
  if (youtubeId) {
    return {
      ...item,
      source: {
        kind: "embed",
        embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`,
        externalUrl: mediaUrl.href,
        posterUrl: suppliedPoster ?? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      },
    };
  }

  const vimeo = vimeoVideoId(mediaUrl.parsed);
  if (vimeo) {
    const embedUrl = new URL(`https://player.vimeo.com/video/${vimeo.id}`);
    embedUrl.searchParams.set("dnt", "1");
    if (vimeo.hash) embedUrl.searchParams.set("h", vimeo.hash);

    return {
      ...item,
      source: {
        kind: "embed",
        embedUrl: embedUrl.toString(),
        externalUrl: mediaUrl.href,
        posterUrl: suppliedPoster,
      },
    };
  }

  const extension = mediaUrl.parsed.pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension && DIRECT_MEDIA_TYPES[extension]) {
    return {
      ...item,
      source: {
        kind: "file",
        externalUrl: mediaUrl.href,
        mediaType: DIRECT_MEDIA_TYPES[extension],
        posterUrl: suppliedPoster,
      },
    };
  }

  return {
    ...item,
    source: { kind: "external", externalUrl: mediaUrl.href, posterUrl: suppliedPoster },
  };
}

function withAutoplay(embedUrl: string) {
  const url = new URL(embedUrl);
  url.searchParams.set("autoplay", "1");
  return url.toString();
}

function Poster({ item }: { item: NormalizedItem }) {
  if (item.source.posterUrl) {
    return (
      // Poster hosts are editor-provided, so they cannot be enumerated in Next image remotePatterns.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={styles["vtk-media-aftermovie-poster"]}
        src={item.source.posterUrl}
        alt=""
        onError={(event) => {
          event.currentTarget.hidden = true;
        }}
      />
    );
  }

  return <Video className={styles["vtk-media-aftermovie-placeholder-icon"]} aria-hidden="true" />;
}

function ExternalFallback({
  externalUrl,
  labels,
}: {
  externalUrl: string | null;
  labels: AftermoviePlayerLabels;
}) {
  return (
    <div className={styles["vtk-media-aftermovie-fallback"]}>
      <VideoOff aria-hidden="true" />
      <p>{labels.unavailable}</p>
      {externalUrl ? (
        <a href={externalUrl} target="_blank" rel="noreferrer">
          {labels.openExternal}
          <ExternalLink aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

function DirectVideo({ item, labels }: { item: NormalizedItem; labels: AftermoviePlayerLabels }) {
  const [failed, setFailed] = useState(false);
  if (item.source.kind !== "file") return null;

  if (failed) {
    return <ExternalFallback externalUrl={item.source.externalUrl} labels={labels} />;
  }

  return (
    <video
      className={styles["vtk-media-aftermovie-media"]}
      controls
      playsInline
      preload="metadata"
      poster={item.source.posterUrl ?? undefined}
      aria-label={item.title}
      onError={() => setFailed(true)}
    >
      <source src={item.source.externalUrl} type={item.source.mediaType} />
      <a href={item.source.externalUrl} target="_blank" rel="noreferrer">
        {labels.openExternal}
      </a>
    </video>
  );
}

function ActivePlayer({
  item,
  labels,
  started,
  onPlay,
}: {
  item: NormalizedItem;
  labels: AftermoviePlayerLabels;
  started: boolean;
  onPlay: () => void;
}) {
  if (item.source.kind === "file") {
    return <DirectVideo key={`${item.id}:${item.source.externalUrl}`} item={item} labels={labels} />;
  }

  if (item.source.kind === "embed") {
    if (started) {
      return (
        <iframe
          key={item.id}
          className={styles["vtk-media-aftermovie-media"]}
          src={withAutoplay(item.source.embedUrl)}
          title={item.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      );
    }

    return (
      <>
        <Poster item={item} />
        <button
          type="button"
          className={styles["vtk-media-aftermovie-play"]}
          onClick={onPlay}
          aria-label={`${labels.play}: ${item.title}`}
          title={labels.play}
        >
          <Play aria-hidden="true" fill="currentColor" />
          <span>{labels.play}</span>
        </button>
      </>
    );
  }

  return <ExternalFallback externalUrl={item.source.externalUrl} labels={labels} />;
}

export function AftermoviePlayer({
  items,
  labels,
}: {
  items: AftermoviePlayerItem[];
  labels: AftermoviePlayerLabels;
}) {
  const normalizedItems = items.map(normalizeItem);
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [startedId, setStartedId] = useState<string | null>(null);
  const activeItem = normalizedItems.find((item) => item.id === selectedId) ?? normalizedItems[0] ?? null;

  if (!activeItem) {
    return (
      <div className={styles["vtk-media-aftermovie-empty"]} role="status">
        <VideoOff aria-hidden="true" />
        <p>{labels.unavailable}</p>
      </div>
    );
  }

  const hasPlaylist = normalizedItems.length > 1;

  return (
    <div
      className={`${styles["vtk-media-aftermovie-gallery"]} ${
        hasPlaylist ? "" : styles["vtk-media-aftermovie-gallery-single"]
      }`}
    >
      <div className={styles["vtk-media-aftermovie-stage"]}>
        <div className={styles["vtk-media-aftermovie-viewport"]}>
          <ActivePlayer
            item={activeItem}
            labels={labels}
            started={startedId === activeItem.id}
            onPlay={() => setStartedId(activeItem.id)}
          />
        </div>
        <div className={styles["vtk-media-aftermovie-caption"]} aria-live="polite">
          <h3>{activeItem.title}</h3>
          {activeItem.publishedLabel ? <p>{activeItem.publishedLabel}</p> : null}
        </div>
      </div>

      {hasPlaylist ? (
        <ul className={styles["vtk-media-aftermovie-list"]}>
          {normalizedItems.map((item) => {
            const selected = item.id === activeItem.id;

            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`${styles["vtk-media-aftermovie-item"]} ${
                    selected ? styles["vtk-media-aftermovie-item-active"] : ""
                  }`}
                  onClick={() => {
                    if (!selected) {
                      setSelectedId(item.id);
                      setStartedId(null);
                    }
                  }}
                  aria-pressed={selected}
                  aria-label={item.title}
                >
                  <span className={styles["vtk-media-aftermovie-thumbnail"]}>
                    <Poster item={item} />
                    {item.source.kind === "external" ? (
                      <ExternalLink aria-hidden="true" />
                    ) : (
                      <Play aria-hidden="true" fill="currentColor" />
                    )}
                  </span>
                  <span className={styles["vtk-media-aftermovie-item-copy"]}>
                    <strong>{item.title}</strong>
                    {item.publishedLabel ? <span>{item.publishedLabel}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
