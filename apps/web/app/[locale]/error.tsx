"use client";

import Link from "@/components/ui/Link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * De foutpagina voor alles onder de taal. Zonder dit bestand viel elke fout in
 * een pagina door tot `app/global-error.tsx`, die de root layout vervangt: weg
 * header, weg footer, een kale Next-foutmelding en geen weg terug. Hier blijft
 * de site eromheen staan en rendert enkel de pagina een foutmelding, in
 * dezelfde donkere paginakop als de 404 (`NotFoundView`).
 *
 * Bewust geen `getDictionary`: dat zou beide woordenboeken in de clientbundel
 * trekken voor twee zinnen.
 */
const copy = {
  nl: {
    kicker: "Er ging iets mis",
    title: "Deze pagina kon niet geladen worden",
    lead: "Probeer het opnieuw. Blijft het misgaan, mail dan naar it@vtk.be en geef de foutcode hieronder mee.",
    retry: "Opnieuw proberen",
    home: "Naar de homepage",
    code: "Foutcode",
  },
  en: {
    kicker: "Something went wrong",
    title: "This page could not be loaded",
    lead: "Please try again. If it keeps failing, email it@vtk.be and include the error code below.",
    retry: "Try again",
    home: "Go to the homepage",
    code: "Error code",
  },
} as const;

export default function LocaleError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const pathname = usePathname();
  const locale = pathname === "/en" || pathname.startsWith("/en/") ? "en" : "nl";
  const t = copy[locale];

  useEffect(() => {
    // Een fout op de server heeft Sentry al (via `onRequestError`); een fout in
    // de browser komt hier enkel langs. Sentry pas laden wanneer er echt iets
    // misging, en enkel melden wanneer de bezoeker toestemming gaf: zonder
    // toestemming is Sentry niet gestart en doet `captureException` niets.
    void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">{t.kicker}</div>
          <h1 className="vtk-page-title">{t.title}</h1>
          <p className="vtk-page-subtitle">{t.lead}</p>
        </div>
      </header>

      <div className="vtk-page-shell">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={() => retry()}>
            {t.retry}
          </button>
          <Link className="btn btn-ghost" href={locale === "en" ? "/en" : "/"}>
            {t.home}
          </Link>
        </div>
        {error.digest ? (
          <p className="mt-6 text-sm text-[color:var(--body)]">
            {t.code}: <code>{error.digest}</code>
          </p>
        ) : null}
      </div>
    </div>
  );
}
