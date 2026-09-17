'use client';

import { useParams } from 'next/navigation';
import { DEFAULT_LOCALE, getDictionary, hasLocale } from '@vtk/i18n';

/**
 * Wachtscherm voor een album.
 *
 * De albumpagina is dynamisch en rendert elke foto van het album; op de grootste
 * albums (~1500 foto's) kost dat de server bijna een seconde. Zonder deze
 * grens blijft de bezoeker na een klik in de albumlijst op de vorige pagina
 * staan zonder dat er iets beweegt, want de prefetch van een dynamische route
 * levert niets om alvast te tonen.
 *
 * Dit is een client component omdat Next aan `loading.tsx` geen `params`
 * doorgeeft; de taal komt dus uit `useParams`. Er staat bewust geen aantal en
 * geen titel in: die weten we hier nog niet, en een verzonnen getal dat daarna
 * verspringt is erger dan geen getal.
 */
const SKELETON_TILES = [
  { ratio: '3 / 2' },
  { ratio: '2 / 3' },
  { ratio: '3 / 2' },
  { ratio: '4 / 3' },
  { ratio: '3 / 4' },
  { ratio: '3 / 2' },
  { ratio: '3 / 2' },
  { ratio: '2 / 3' },
  { ratio: '4 / 3' },
  { ratio: '3 / 2' },
  { ratio: '3 / 4' },
  { ratio: '3 / 2' },
];

export default function MediaAlbumLoading() {
  const params = useParams<{ locale: string }>();
  const raw = typeof params?.locale === 'string' ? params.locale : DEFAULT_LOCALE;
  const dict = getDictionary(hasLocale(raw) ? raw : DEFAULT_LOCALE);

  return (
    <div className="vtk-page" aria-busy="true">
      <header className="vtk-album-hero">
        <div className="vtk-album-hero-inner">
          <div>
            <div className="vtk-album-hero-kicker">
              <span className="vtk-immich-skeleton" style={{ width: 160, height: 13 }} aria-hidden="true" />
            </div>
            <span
              className="vtk-immich-skeleton"
              style={{ width: 'min(420px, 70vw)', height: 42, marginTop: 14 }}
              aria-hidden="true"
            />
          </div>
          <div className="vtk-album-hero-meta">
            <span className="vtk-immich-skeleton" style={{ width: 74, height: 22 }} aria-hidden="true" />
          </div>
        </div>
      </header>

      <div className="vtk-page-shell vtk-immich-detail-shell">
        <ul className="vtk-immich-photo-masonry">
          {SKELETON_TILES.map((tile, index) => (
            <li key={index} className="vtk-immich-photo-tile">
              <span className="vtk-immich-skeleton" style={{ aspectRatio: tile.ratio }} aria-hidden="true" />
            </li>
          ))}
        </ul>
      </div>

      <span className="vtk-immich-visually-hidden" role="status">
        {dict.common.loading}
      </span>
    </div>
  );
}
