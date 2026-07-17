"use client";

import { Input, Label } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";

/** Zelfde regel als SLUG_REGEX in app/actions/pages.ts. */
const SLUG_PATTERN = "[a-z0-9]([a-z0-9\\-]*[a-z0-9])?";
const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug.trim());
}

/**
 * Het adresveld van een pagina, met de uitleg die erbij hoort: dat de slug uniek
 * moet zijn, en dat de pagina bij een wijziging verhuist en oude links breken.
 *
 * Gedeeld door de editor (`/admin/paginas/[id]`) en de inspector
 * (`/admin/inhoud`): de waarschuwing hoort op beide plekken hetzelfde te zijn,
 * en stond eerst enkel in de editor.
 */
export function SlugField({
  locale,
  id,
  name,
  value,
  onChange,
}: {
  locale: Locale;
  id: string;
  /** Zet dit wanneer het veld in een <form> zit en zelf meegestuurd moet worden. */
  name?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const nl = locale === "nl";
  const valid = isValidSlug(value);

  return (
    <div>
      <Label htmlFor={id}>{nl ? "Adres (slug)" : "Address (slug)"}</Label>
      <div className="flex items-center gap-1">
        <span className="shrink-0 font-mono text-sm text-[#5c667f]">/p/</span>
        <Input
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          pattern={SLUG_PATTERN}
          required
          aria-invalid={!valid}
        />
      </div>
      {!valid ? (
        <p className="mt-1 text-xs text-red-600">
          {nl
            ? "Enkel kleine letters, cijfers en koppeltekens; niet beginnen of eindigen met een koppelteken."
            : "Lowercase letters, digits and hyphens only; cannot start or end with a hyphen."}
        </p>
      ) : (
        <p className="mt-1 text-xs text-[#5c667f]">
          {nl
            ? "Het adres van deze pagina. Moet uniek zijn over de hele site; bij een wijziging verhuist de pagina en werken bestaande links naar het oude adres niet meer."
            : "This page's address. Must be unique across the whole site; changing it moves the page and existing links to the old address stop working."}
        </p>
      )}
    </div>
  );
}
