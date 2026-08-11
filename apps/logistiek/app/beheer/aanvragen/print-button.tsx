'use client';

/**
 * Opent het afdrukvenster. Een link naar de printpagina volstaat niet: die toont
 * het blad wel, maar dan moet je nog zelf naar het menu van de browser.
 */
export function PrintButton({ label = 'Afdrukken' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-vtk-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-vtk-ink"
    >
      {label}
    </button>
  );
}
