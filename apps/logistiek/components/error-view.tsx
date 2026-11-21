'use client';

import { useEffect, useState } from 'react';
import Link from '@vtk/ui/link';
import { Button } from '@vtk/ui';
import { PageShell } from '@/components/page-shell';

/**
 * Wat er staat wanneer een pagina of een actie onverwacht faalt (R1).
 *
 * Zonder `error.tsx` toonde Next zijn eigen kale foutscherm: wit, in het Engels,
 * zonder kop en zonder weg terug, en in de donkere modus een wit blad. Hier
 * blijven de kop en de footer van de uitleendienst staan, en in het beheer ook
 * de zijbalk; enkel het stuk dat faalde, wordt deze melding.
 *
 * Een opslag die de server nooit bereikte (een pagina van vóór de deploy, geen
 * verbinding) komt hier niet: die vangt `unsentGuard` op als rode toast, met het
 * formulier nog ingevuld. Wat hier landt, is een echte fout op de server.
 *
 * De taal komt van `<html lang>` (de layout zet die uit de taalcookie), pas na
 * het mounten: een foutmelding die net anders hydrateert dan ze server-side
 * rendert, is zelf een tweede fout.
 */
const COPY = {
  nl: {
    kicker: 'Er ging iets mis',
    title: 'Deze pagina kon niet geladen worden',
    lead: 'Probeer het opnieuw. Blijft het misgaan, mail dan naar it@vtk.be en geef de foutcode hieronder mee.',
    retry: 'Opnieuw proberen',
    home: 'Naar de uitleendienst',
    admin: 'Naar het overzicht',
    code: 'Foutcode',
  },
  en: {
    kicker: 'Something went wrong',
    title: 'This page could not be loaded',
    lead: 'Please try again. If it keeps failing, email it@vtk.be and include the error code below.',
    retry: 'Try again',
    home: 'Back to the equipment service',
    admin: 'To the overview',
    code: 'Error code',
  },
} as const;

function useDocumentLocale(): 'nl' | 'en' {
  const [locale, setLocale] = useState<'nl' | 'en'>('nl');
  useEffect(() => {
    if (document.documentElement.lang.toLowerCase().startsWith('en')) setLocale('en');
  }, []);
  return locale;
}

function digestOf(error: unknown): string | null {
  if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string') {
    return error.digest;
  }
  return null;
}

export function ErrorView({
  error,
  retry,
  variant,
}: {
  error: unknown;
  retry: () => void;
  /** `page` met de donkere paginakop; `admin` als paneel in de beheerkolom. */
  variant: 'page' | 'admin';
}) {
  const t = COPY[useDocumentLocale()];
  const digest = digestOf(error);

  useEffect(() => {
    // Een fout in de browser staat nergens anders; een fout op de server staat
    // al in de serverlog, onder deze digest.
    console.error(error);
  }, [error]);

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => retry()}>
          {t.retry}
        </Button>
        <Link
          href={variant === 'admin' ? '/beheer' : '/'}
          className="text-sm font-semibold text-vtk-ink underline decoration-vtk-yellow decoration-2 underline-offset-4"
        >
          {variant === 'admin' ? t.admin : t.home}
        </Link>
      </div>
      {digest ? (
        <p className="mt-5 text-sm text-vtk-muted">
          {t.code}: <code className="text-vtk-ink">{digest}</code>
        </p>
      ) : null}
    </>
  );

  if (variant === 'admin') {
    return (
      <section role="alert" className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{t.title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-vtk-body">{t.lead}</p>
        <div className="mt-5">{body}</div>
      </section>
    );
  }

  return (
    <PageShell kicker={t.kicker} title={t.title}>
      <div role="alert" className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
        <p className="max-w-2xl text-vtk-body">{t.lead}</p>
        <div className="mt-5">{body}</div>
      </div>
    </PageShell>
  );
}
