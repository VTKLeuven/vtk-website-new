'use client';

import type { ComponentProps } from 'react';
import { SaveForm as SharedSaveForm } from '@vtk/ui/save-form';

type SharedProps = ComponentProps<typeof SharedSaveForm>;

/**
 * De `SaveForm` van vtk.be (`@vtk/ui/save-form`), met een standaardmelding voor
 * een fout zonder eigen tekst. Tot november 2026 stond hier een vereenvoudigde
 * kopie; die miste het vangnet voor een opslag die de server nooit bereikte
 * (een pagina van vóór de deploy, geen verbinding), en dan verving de
 * foutpagina het hele formulier.
 *
 * Gebruik geen kaal `<form action={...}>` zonder feedback (zie CLAUDE.md).
 */
export function SaveForm({
  fallbackErrorMessage,
  ...props
}: Omit<SharedProps, 'fallbackErrorMessage'> & { fallbackErrorMessage?: string }) {
  return (
    <SharedSaveForm
      {...props}
      fallbackErrorMessage={fallbackErrorMessage ?? 'Opslaan is niet gelukt. Probeer opnieuw.'}
    />
  );
}
