import type { Metadata } from 'next';
import Link from 'next/link';
import { galleryMarker, immichWebUrl } from '@vtk/gallery';
import { AlbumUploader } from './album-uploader';
import { ElixirIcon } from '@/components/elixir-icon';
import { fakbarGallery } from '@/lib/gallery';

export const metadata: Metadata = { title: "Foto's" };

export const dynamic = 'force-dynamic';

function formatAlbumDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export default async function AdminFotosPage() {
  const [listing, ambiguous] = await Promise.all([
    fakbarGallery.listAlbums().catch(() => null),
    fakbarGallery.listAmbiguousAlbums().catch(() => []),
  ]);

  const albums = listing?.albums ?? [];
  const failed = listing === null;

  return (
    <div className="space-y-8">
      <div className="fakbar-section-head">
        <h2>Fotogalerij</h2>
        <p>
          De albums van &rsquo;t ElixIr staan in Immich, los van de galerij op vtk.be. Wat je hier uploadt,
          verschijnt op onze eigen fotopagina en niet op de hoofdsite; daar staat enkel wat VTK zelf selecteert.
        </p>
      </div>

      {ambiguous.length > 0 ? (
        <div className="rounded-[18px] border border-[rgba(248,113,113,0.4)] bg-[rgba(248,113,113,0.1)] px-5 py-4">
          <h3 className="text-sm font-bold text-[var(--danger)]">
            {ambiguous.length === 1 ? 'Eén album staat' : `${ambiguous.length} albums staan`} nergens
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--body)]">
            {ambiguous.length === 1 ? 'Dit album draagt' : 'Deze albums dragen'} in Immich de merker van meer dan
            één galerij, dus we kunnen niet weten waar {ambiguous.length === 1 ? 'het' : 'ze'} hoort. Zolang dat zo
            is {ambiguous.length === 1 ? 'verschijnt het' : 'verschijnen ze'} noch hier, noch op vtk.be. Haal in
            Immich de overbodige merker uit de albumbeschrijving.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-[var(--body)]">
            {ambiguous.map((album) => (
              <li key={album.id}>
                <strong className="text-[var(--ink)]">{album.title}</strong>{' '}
                <span className="text-[var(--muted)]">({album.markers.join(' en ')})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="fakbar-card fakbar-card-accent">
        <h3 className="text-base font-semibold text-[var(--ink)]">Nieuw album</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Maak een album en upload de foto&rsquo;s in één keer. Grote reeksen mogen: ze gaan één voor één omhoog en
          je ziet de voortgang.
        </p>
        <div className="mt-5">
          <AlbumUploader />
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-sm font-bold uppercase tracking-[0.07em] text-[var(--muted)]">
            Albums in deze galerij{albums.length > 0 ? ` (${albums.length})` : ''}
          </h3>
          <a
            href={immichWebUrl()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink)] underline underline-offset-2"
          >
            Openen in Immich
            <ElixirIcon name="external" className="h-3.5 w-3.5" />
          </a>
        </div>

        {failed ? (
          <div className="fakbar-empty">
            <h3>Immich is niet bereikbaar</h3>
            <p>De fotoserver antwoordt niet. De albums zelf zijn niet weg; probeer het straks opnieuw.</p>
          </div>
        ) : albums.length === 0 ? (
          <div className="fakbar-empty">
            <h3>Nog geen albums</h3>
            <p>
              Zodra je hierboven een album aanmaakt, staat het hier en op de publieke fotopagina. Albums die in
              Immich zelf gemaakt zijn, komen er pas bij als hun beschrijving de merker{' '}
              <code className="rounded bg-[var(--paper-2)] px-1.5 py-0.5 text-[13px]">{galleryMarker('fakbar')}</code>{' '}
              draagt.
            </p>
          </div>
        ) : (
          <div className="fakbar-table-wrap">
            <table className="fakbar-table fakbar-table-stack">
              <thead>
                <tr>
                  <th>Album</th>
                  <th>Datum</th>
                  <th className="num">Foto&rsquo;s</th>
                  <th>
                    <span className="sr-only">Bekijken</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {albums.map((album) => (
                  <tr key={album.id}>
                    <td data-label="Album">
                      <span className="font-medium text-[var(--ink)]">{album.title}</span>
                      {album.description ? (
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">{album.description}</span>
                      ) : null}
                    </td>
                    <td data-label="Datum">{formatAlbumDate(album.date) ?? 'geen datum'}</td>
                    <td className="num tabular-nums" data-label="Foto's">
                      {album.photoCount}
                    </td>
                    <td data-label="">
                      <Link
                        href={`/fotos/${album.slug}`}
                        className="text-sm font-medium text-[var(--ink)] underline underline-offset-2"
                      >
                        Bekijken
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
