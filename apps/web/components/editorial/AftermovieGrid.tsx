"use client";

import { useState } from "react";

export type AftermovieGridItem = {
  id: string;
  title: string;
  embedUrl: string;
  externalUrl: string;
  posterUrl: string | null;
};

/**
 * Aftermovies op de homepage: een rooster van maximaal 6 video's (3 per rij).
 *
 * De iframe wordt pas geplaatst na een klik op de poster. Zes YouTube-iframes
 * meteen inladen kost trackers en een pak verkeer op een pagina waar de meeste
 * bezoekers gewoon voorbijscrollen; de poster is één afbeelding.
 */
export function AftermovieGrid({
  items,
  playLabel,
}: {
  items: AftermovieGridItem[];
  playLabel: string;
}) {
  const [startedId, setStartedId] = useState<string | null>(null);

  return (
    <div className="am-grid">
      {items.map((item) => (
        <figure className="am-card" key={item.id}>
          <div className="am-frame">
            {startedId === item.id ? (
              <iframe
                className="am-media"
                src={`${item.embedUrl}&autoplay=1`}
                title={item.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <button
                type="button"
                className="am-play"
                onClick={() => setStartedId(item.id)}
                aria-label={`${playLabel}: ${item.title}`}
                title={playLabel}
              >
                {item.posterUrl ? (
                  // De poster komt van YouTube (i.ytimg.com); die host staat niet
                  // in next/image remotePatterns, en de admin mag zelf een poster
                  // opgeven, dus die set is niet op voorhand te kennen.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="am-poster" src={item.posterUrl} alt="" loading="lazy" />
                ) : (
                  <span className="am-poster am-poster-ph" aria-hidden="true" />
                )}
                <span className="am-play-badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </button>
            )}
          </div>
          <figcaption className="am-cap">
            <h3>{item.title}</h3>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
