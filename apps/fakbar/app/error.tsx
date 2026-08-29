'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Wat je ziet als er iets stukloopt.
 *
 * Deze app had er geen. Zonder error boundary valt Next terug op zijn eigen
 * kale pagina: geen header, geen voettekst, geen kleuren van de fakbar. Dat
 * leest niet als "er ging iets mis" maar als "de site is kapot", en de melding
 * die je dan krijgt is voor de bezoeker onbruikbaar.
 *
 * Route-niveau en niet `global-error`, want dan blijft de layout eromheen wel
 * staan: je zit nog altijd op de site en kan gewoon verder klikken.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // De digest is wat je nodig hebt om dit in de serverlog terug te vinden.
    console.error('Fakbar-pagina liep stuk', error);
  }, [error]);

  return (
    <>
      <div className="fakbar-page-head">
        <div className="fakbar-page-head-inner">
          <h1>Er ging iets mis</h1>
          <p className="fakbar-page-intro">
            Deze pagina kon niet geladen worden. Aan jou ligt het niet.
          </p>
        </div>
      </div>

      <div className="fakbar-page-content">
        <div className="fakbar-empty">
          <h3>Probeer het opnieuw</h3>
          <p>
            Blijft het misgaan, laat het dan weten via{' '}
            <a href="mailto:fakbar@vtk.be" className="underline underline-offset-2">
              fakbar@vtk.be
            </a>
            {error.digest ? (
              <>
                {' '}
                met deze code erbij: <code className="fakbar-error-digest">{error.digest}</code>
              </>
            ) : null}
            .
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="fakbar-btn fakbar-btn-primary" onClick={reset}>
              Opnieuw proberen
            </button>
            <Link href="/" className="fakbar-btn fakbar-btn-ghost">
              Naar de startpagina
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
