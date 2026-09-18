'use client';

import { THEME_STORAGE_KEY, type Theme } from '@/lib/theme-shared';

/* De knop houdt zelf geen toestand bij: de waarheid staat als `data-theme` op
   <html>, gezet door het script in de layout. Zou React de toestand dragen, dan
   rendert de server een zon terwijl de browser al een maan toont, en dat is een
   hydratiefout plus een zichtbare sprong.

   Daarom staan beide pictogrammen in de knop en beslist de CSS welk van de twee
   je ziet (zie .theme-toggle in globals.css). Het label zegt wat de knop dóét en
   verandert niet mee: "wissel" is in beide toestanden waar, en een label dat van
   de modus afhangt zou hetzelfde probleem terugbrengen. */
export function ThemeToggle({ label }: { label: string }) {
  function toggle() {
    const root = document.documentElement;
    const next: Theme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    // Eerst bewaren, dan pas zetten: de bewaker in het layout-script kijkt naar
    // localStorage wanneer het attribuut verdwijnt, en zou anders in dat ene
    // ogenblik de vorige keuze terugzetten.
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Privémodus of geblokkeerde opslag: de keuze geldt dan enkel voor deze
      // pagina. Beter dan een knop die niets doet.
    }
    root.setAttribute('data-theme', next);
  }

  return (
    <button type="button" className="theme-toggle" onClick={toggle} title={label} aria-label={label}>
      <svg
        className="theme-toggle-icon theme-toggle-moon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
      </svg>
      <svg
        className="theme-toggle-icon theme-toggle-sun"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="4.25" />
        <path d="M12 2.75v2M12 19.25v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2.75 12h2M19.25 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    </button>
  );
}
