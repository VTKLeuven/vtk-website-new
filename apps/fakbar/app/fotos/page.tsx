import type { Metadata } from 'next';
import Link from 'next/link';
import { ElixirIcon } from '@/components/elixir-icon';
import { fakbarGallery } from '@/lib/gallery';
import { getSession, canManageFakbar } from '@/lib/session';

export const metadata: Metadata = {
  title: "Foto's",
  description: "De fotogalerij van 't ElixIr: alle avonden, cantussen en TD's in de fakbar.",
};

export const dynamic = 'force-dynamic';

function formatAlbumDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export default async function FotosPage() {
  // Immich mag onbereikbaar zijn zonder dat de pagina stukloopt; dat gebeurt in
  // de praktijk, want de proxy draait in een aparte container.
  const [result, session] = await Promise.all([
    fakbarGallery.listAlbums().catch(() => null),
    getSession(),
  ]);
  const albums = result?.albums ?? [];
  const failed = result === null;
  const canManage = session ? canManageFakbar(session) : false;

  return (
    <>
      <div className="fakbar-page-head">
        <div className="fakbar-page-head-inner">
          <p className="fakbar-eyebrow">&rsquo;t ElixIr</p>
          <h1>Foto&rsquo;s</h1>
          <p className="fakbar-page-intro">
            Alles wat er in de fakbar gebeurt, zoals het gebeurd is. Deze galerij staat los van de fotopagina van
            vtk.be: daar staat het geselecteerde werk, hier staat de avond zelf.
          </p>
        </div>
      </div>

      <div className="fakbar-page-content">
        {canManage ? (
          <div className="mb-7 flex flex-wrap items-center gap-3">
            <Link href="/admin/fotos" className="fakbar-btn fakbar-btn-ghost">
              <ElixirIcon name="plus" className="h-4 w-4" />
              Album toevoegen
            </Link>
          </div>
        ) : null}

        {failed ? (
          <div className="fakbar-empty">
            <h3>De galerij is even niet bereikbaar</h3>
            <p>
              De fotoserver antwoordt op dit moment niet. Probeer het straks opnieuw; de albums zelf zijn niet weg.
            </p>
          </div>
        ) : albums.length === 0 ? (
          <div className="fakbar-empty">
            <h3>Nog geen albums</h3>
            <p>
              Er staan nog geen fotoalbums in de galerij van &rsquo;t ElixIr. Na de volgende avond staat hier het
              eerste.
            </p>
          </div>
        ) : (
          <ul className="fakbar-album-grid">
            {albums.map((album) => {
              const date = formatAlbumDate(album.date);
              return (
                <li key={album.id}>
                  <Link href={`/fotos/${album.slug}`} className="fakbar-album-card">
                    <div className="fakbar-album-cover">
                      {album.coverPhoto ? (
                        // De duimnagel komt al op maat van de Immich-proxy, op een
                        // host die de Next-optimizer niet kent; daarom een gewone
                        // <img> en geen next/image.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={album.coverPhoto.thumbnailUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="fakbar-album-cover-empty" aria-hidden>
                          <ElixirIcon name="photo" className="h-7 w-7" />
                        </span>
                      )}
                    </div>
                    <div className="fakbar-album-body">
                      <h2>{album.title}</h2>
                      <p className="fakbar-album-meta">
                        {[date, `${album.photoCount} ${album.photoCount === 1 ? 'foto' : "foto's"}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {album.description ? <p className="fakbar-album-desc">{album.description}</p> : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-10 text-sm leading-relaxed text-[var(--muted)]">
          Sta je op een foto die je liever niet online ziet? Mail{' '}
          <a className="font-medium text-[var(--ink)] underline underline-offset-2" href="mailto:fakbar@vtk.be">
            fakbar@vtk.be
          </a>{' '}
          en we halen ze weg.
        </p>
      </div>
    </>
  );
}
