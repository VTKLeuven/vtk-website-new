import type { ReactNode } from 'react';

/* Gedeeld pagina-skelet. Functionele pagina's gebruiken dezelfde vaste donkere
   paginakop als vtk.be, zonder een eigen fotohero of afwijkende typografie. */
export function PageShell({
  kicker = 'VTK Logistiek',
  title,
  intro,
  children,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex-1">
      <header className="logistics-page-head">
        <div className="logistics-page-head-inner">
          <p className="logistics-eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-vtk-yellow" aria-hidden />
            {kicker}
          </p>
          <h1>
            {title}
          </h1>
          {intro ? <p className="logistics-page-intro">{intro}</p> : null}
        </div>
      </header>
      <div className="logistics-page-content">{children}</div>
    </main>
  );
}
