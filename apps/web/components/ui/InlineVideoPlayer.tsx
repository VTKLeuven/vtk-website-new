"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { safeUrl, vimeoVideoId, youtubeThumbnailUrl, youtubeVideoId } from "@/lib/videoEmbed";

function withAutoplay(embedUrl: string): string {
  try {
    const url = new URL(embedUrl);
    url.searchParams.set("autoplay", "1");
    return url.toString();
  } catch {
    return embedUrl;
  }
}

export function InlineVideoPlayer({
  src,
  title,
  poster,
}: {
  src: string;
  title?: string;
  poster?: string;
}) {
  const [started, setStarted] = useState(false);
  const media = safeUrl(src);
  if (!media) return null;

  const youtubeId = youtubeVideoId(media.parsed);
  const vimeo = vimeoVideoId(media.parsed);
  const isDirectVideo =
    media.parsed.pathname.endsWith(".mp4") ||
    media.parsed.pathname.endsWith(".webm") ||
    media.parsed.pathname.endsWith(".ogg");

  if (isDirectVideo) {
    const mimeType = media.parsed.pathname.endsWith(".webm")
      ? "video/webm"
      : media.parsed.pathname.endsWith(".ogg")
        ? "video/ogg"
        : "video/mp4";

    return (
      <div className="not-prose my-6 mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-vtk-blue/15 bg-vtk-ink shadow-sm">
        <video
          controls
          playsInline
          preload="metadata"
          poster={poster}
          aria-label={title || "Video"}
          className="aspect-video w-full object-contain"
        >
          <source src={media.href} type={mimeType} />
          <a href={media.href} target="_blank" rel="noopener noreferrer" className="p-4 text-white underline">
            {title || "Video downloaden"}
          </a>
        </video>
      </div>
    );
  }

  let embedUrl = "";
  let posterUrl = poster ?? null;
  let isYouTube = false;

  if (youtubeId) {
    isYouTube = true;
    embedUrl = `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`;
    posterUrl = posterUrl ?? youtubeThumbnailUrl(youtubeId);
  } else if (vimeo) {
    const vimeoUrl = new URL(`https://player.vimeo.com/video/${vimeo.id}`);
    vimeoUrl.searchParams.set("dnt", "1");
    if (vimeo.hash) vimeoUrl.searchParams.set("h", vimeo.hash);
    embedUrl = vimeoUrl.toString();
  } else {
    return (
      <div className="not-prose my-6 mx-auto w-full max-w-3xl rounded-2xl border border-vtk-blue/15 bg-vtk-blue-soft/30 p-6 text-center">
        <a
          href={media.href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-vtk-blue underline"
        >
          {title || "Video bekijken"}
        </a>
      </div>
    );
  }

  return (
    <div className="not-prose my-6 mx-auto relative aspect-video w-full max-w-3xl overflow-hidden rounded-2xl border border-vtk-blue/15 bg-vtk-ink shadow-sm">
      {started ? (
        <iframe
          src={withAutoplay(embedUrl)}
          title={title || "Video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full border-0"
        />
      ) : (
        <div className="group relative h-full w-full">
          {posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={posterUrl}
              alt={title || "Video thumbnail"}
              className="h-full w-full object-cover opacity-90 transition-opacity duration-200 group-hover:opacity-100"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full bg-vtk-ink" />
          )}

          <div className="absolute inset-0 flex items-center justify-center bg-black/15 transition-colors group-hover:bg-black/25">
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="group/btn flex items-center justify-center transition-transform hover:scale-108 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-vtk-yellow"
              aria-label={title ? `Video afspelen: ${title}` : "Video afspelen"}
              title={title ? `Video afspelen: ${title}` : "Video afspelen"}
            >
              {isYouTube ? (
                <svg width="68" height="48" viewBox="0 0 68 48" className="drop-shadow-lg" aria-hidden="true">
                  <path
                    className="fill-red-600 transition-colors group-hover/btn:fill-red-700"
                    d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z"
                  />
                  <polygon fill="#ffffff" points="45,24 27,14 27,34" />
                </svg>
              ) : (
                <div className="flex size-14 items-center justify-center rounded-full bg-vtk-yellow text-vtk-ink shadow-lg transition-transform group-hover/btn:scale-105">
                  <Play size={24} fill="currentColor" aria-hidden="true" className="translate-x-0.5" />
                </div>
              )}
            </button>
          </div>

          {title && (
            <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 via-black/30 to-transparent p-4 text-white">
              <span className="font-semibold drop-shadow">{title}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
