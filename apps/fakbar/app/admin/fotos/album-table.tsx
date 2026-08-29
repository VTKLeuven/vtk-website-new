'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ElixirIcon } from '@/components/elixir-icon';
import { AlbumUploader } from './album-uploader';

/**
 * De albums van deze galerij, met per rij de mogelijkheid om er foto's bij te
 * zetten.
 *
 * Client component omwille van die ene toestand: welk album staat open. Het
 * uploadveld schuift uit onder de rij en niet in een modal; je kiest bestanden
 * en volgt de voortgang, en dat is niets om een venster voor te openen. Er staat
 * er hoogstens één tegelijk open, want twee reeksen tegelijk uploaden naar twee
 * albums is een manier om door elkaar te raken.
 */

export type AlbumRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  date: string | null;
  photoCount: number;
};

export function AlbumTable({ albums }: { albums: AlbumRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="fakbar-table-wrap">
      <table className="fakbar-table fakbar-table-stack">
        <thead>
          <tr>
            <th>Album</th>
            <th>Datum</th>
            <th className="num">Foto&rsquo;s</th>
            <th>
              <span className="sr-only">Acties</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {albums.map((album) => {
            const open = openId === album.id;
            return (
              <Fragment key={album.id}>
                <tr>
                  <td data-label="Album">
                    <span className="font-medium text-[var(--ink)]">{album.title}</span>
                    {album.description ? (
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">{album.description}</span>
                    ) : null}
                  </td>
                  <td data-label="Datum">{album.date ?? 'geen datum'}</td>
                  <td className="num tabular-nums" data-label="Foto's">
                    {album.photoCount === 0 ? (
                      // Een leeg album is bijna altijd een upload die misliep;
                      // dat hoort op te vallen in plaats van als een nul weg te
                      // zakken tussen de rest.
                      <span className="fakbar-badge" data-tone="warn" title="Dit album bevat nog geen foto's">
                        leeg
                      </span>
                    ) : (
                      album.photoCount
                    )}
                  </td>
                  <td data-label="">
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <Link
                        href={`/fotos/${album.slug}`}
                        className="text-sm font-medium text-[var(--ink)] underline underline-offset-2"
                      >
                        Bekijken
                      </Link>
                      <button
                        type="button"
                        className="fakbar-btn fakbar-btn-ghost"
                        onClick={() => setOpenId((current) => (current === album.id ? null : album.id))}
                        aria-expanded={open}
                      >
                        <ElixirIcon name={open ? 'close' : 'plus'} className="h-4 w-4" />
                        {open ? 'Sluiten' : "Foto's toevoegen"}
                      </button>
                    </div>
                  </td>
                </tr>
                {open ? (
                  <tr className="fakbar-album-upload-row">
                    <td colSpan={4}>
                      <div className="fakbar-album-upload">
                        <h4>Foto&rsquo;s toevoegen aan {album.title}</h4>
                        <AlbumUploader album={{ id: album.id, title: album.title }} />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
