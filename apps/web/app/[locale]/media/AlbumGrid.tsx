'use client';

import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

const INITIAL_ALBUM_COUNT = 8;

type AlbumItem = {
  id: string;
  href: string;
  title: string;
  photoCount: number;
  dateLabel: string | null;
  description: string | null;
  thumbnailUrl: string | null;
};

type AlbumLabels = {
  album: string;
  photo: string;
  photos: string;
  showMore: string;
  showLess: string;
};

export function AlbumGrid({ albums, labels }: { albums: AlbumItem[]; labels: AlbumLabels }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = albums.length > INITIAL_ALBUM_COUNT;
  const visibleAlbums = expanded ? albums : albums.slice(0, INITIAL_ALBUM_COUNT);
  const remainingCount = albums.length - INITIAL_ALBUM_COUNT;

  return (
    <>
      <ul id="media-photo-albums" className="vtk-immich-album-grid">
        {visibleAlbums.map((album) => (
          <li key={album.id}>
            <Link href={album.href} className="vtk-immich-album-card">
              <span className="vtk-immich-album-cover">
                {album.thumbnailUrl ? (
                  // Immich thumbnails are served through its authenticated proxy and have no fixed host.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={album.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="ph-label">{labels.album}</span>
                )}
              </span>
              <span className="vtk-immich-album-body">
                <span className="vtk-immich-album-title">{album.title}</span>
                <span className="vtk-immich-album-meta">
                  {album.photoCount} {album.photoCount === 1 ? labels.photo : labels.photos}
                  {album.dateLabel ? ` · ${album.dateLabel}` : ''}
                </span>
                {album.description ? (
                  <span className="vtk-immich-album-description">{album.description}</span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {hasMore ? (
        <div className="vtk-media-album-disclosure">
          <button
            type="button"
            aria-controls="media-photo-albums"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            <span>
              {expanded
                ? labels.showLess
                : labels.showMore.replace('{count}', String(remainingCount))}
            </span>
          </button>
        </div>
      ) : null}
    </>
  );
}
