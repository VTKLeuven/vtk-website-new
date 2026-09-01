import type { ReactNode } from 'react';

/* Gedeeld pagina-skelet. Functionele pagina's gebruiken dezelfde vaste donkere
   paginakop als vtk.be, zonder een eigen fotohero of afwijkende typografie. */
export function PageShell({
  kicker = 'VTK Logistiek',
  title,
  intro,
  action,
  compact = false,
  children,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  /**
   * Eén knop rechts in de donkere kop, voor de tweede plek waar deze pagina
   * naartoe leidt.
   *
   * Bewust hier en niet als paneeltje in de inhoud: zo'n paneel leest als een
   * mededeling tussen de rest en scrolt weg, terwijl dit een bestemming is. In
   * de kop staat ze naast de titel, waar je ze verwacht.
   */
  action?: ReactNode;
  /**
   * Op een telefoon een kleinere kop, zonder de inleiding.
   *
   * Voor een scherm dat op één scherm moet passen (het intekenraster van de
   * beschikbaarheid). Daar is de inleiding drie regels die het raster naar
   * beneden duwen tot je moet scrollen, en scrollen is precies wat daar niet
   * kan: je vinger tekent er.
   */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="flex-1">
      <header className={`logistics-page-head${compact ? ' is-compact' : ''}`}>
        <div className="logistics-page-head-inner">
          <div className="logistics-page-head-row">
            <div className="min-w-0">
              <p className="logistics-eyebrow">
                <span className="h-1.5 w-1.5 rounded-full bg-vtk-yellow" aria-hidden />
                {kicker}
              </p>
              <h1>
                {title}
              </h1>
              {intro ? <p className="logistics-page-intro">{intro}</p> : null}
            </div>
            {action ? <div className="logistics-page-head-action">{action}</div> : null}
          </div>
        </div>
      </header>
      <div className={`logistics-page-content${compact ? ' is-compact' : ''}`}>{children}</div>
    </main>
  );
}
