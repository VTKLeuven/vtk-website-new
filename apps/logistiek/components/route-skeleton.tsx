import { LoadingLabel } from '@/components/loading-label';

/**
 * Wat er staat terwijl de server een pagina rendert (R2).
 *
 * Elke pagina van de uitleendienst is dynamisch: zonder laadtoestand toonde een
 * klik niets tot de server klaar was, en dan klik je nog eens. Bewust zonder
 * tekst en zonder echte inhoud: een skelet dat op de pagina lijkt en meteen
 * plaatsmaakt, geen draaiend icoon dat zegt dat het lang gaat duren.
 *
 * `page` met de donkere kop van elke ledenpagina; `admin` als kolom naast de
 * zijbalk van het beheer, die gewoon blijft staan.
 */
export function RouteSkeleton({ variant }: { variant: 'page' | 'admin' }) {
  const rows = (
    <div className="grid gap-3">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="h-20 rounded-[18px] border border-vtk-navy/10 bg-vtk-surface motion-safe:animate-pulse"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  );

  if (variant === 'admin') {
    return (
      <div aria-busy="true">
        <div className="mb-5 h-7 w-56 max-w-full rounded-lg bg-vtk-navy/10 motion-safe:animate-pulse" />
        {rows}
        <LoadingLabel />
      </div>
    );
  }

  return (
    <main className="flex-1" aria-busy="true">
      <header className="logistics-page-head">
        <div className="logistics-page-head-inner">
          <span className="block h-3 w-32 rounded bg-vtk-on-dark/15" />
          <span className="mt-5 block h-10 w-80 max-w-full rounded-lg bg-vtk-on-dark/15 motion-safe:animate-pulse" />
        </div>
      </header>
      <div className="logistics-page-content">{rows}</div>
      <LoadingLabel />
    </main>
  );
}
