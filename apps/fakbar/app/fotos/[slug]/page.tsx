import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ElixirIcon } from '@/components/elixir-icon';
import { AlbumViewer } from './album-viewer';
import { fakbarGallery } from '@/lib/gallery';

export const dynamic = 'force-dynamic';

/**
 * Immich mag onbereikbaar zijn zonder dat de route stukloopt. `cache` zorgt dat
 * de metadata en de pagina hetzelfde antwoord delen in plaats van twee keer een
 * momentopname op te halen.
 */
const loadAlbum = cache(async (slug: string) => {
  try {
    return await fakbarGallery.getAlbum(slug);
  } catch {
    return null;
  }
});

function formatAlbumDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const album = await loadAlbum(slug);
  if (!album) return {};
  const date = formatAlbumDate(album.date);
  return {
    title: album.title,
    description:
      album.description ||
      [`${album.photoCount} foto's`, date].filter(Boolean).join(' · ') ||
      `Foto's van ${album.title} in 't ElixIr.`,
  };
}

export default async function AlbumPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const album = await loadAlbum(slug);
  if (!album) notFound();

  const date = formatAlbumDate(album.date);

  return (
    <>
      <div className="fakbar-page-head">
        <div className="fakbar-page-head-inner">
          <Link href="/fotos" className="fakbar-breadcrumb">
            <ElixirIcon name="chevron" className="h-3.5 w-3.5 rotate-90" />
            Alle albums
          </Link>
          <h1>{album.title}</h1>
          <p className="fakbar-page-intro">
            {[date, `${album.photos.length} ${album.photos.length === 1 ? 'foto' : "foto's"}`]
              .filter(Boolean)
              .join(' · ')}
            {album.description ? ` · ${album.description}` : ''}
          </p>
        </div>
      </div>

      <div className="fakbar-page-content">
        {album.photos.length === 0 ? (
          <div className="fakbar-empty">
            <h3>Dit album is leeg</h3>
            <p>Er staan nog geen foto&rsquo;s in dit album.</p>
          </div>
        ) : (
          <AlbumViewer photos={album.photos} />
        )}
      </div>
    </>
  );
}
