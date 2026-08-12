'use client';

/**
 * "Wat zit erin?" voor een set, uitklapbaar. De inhoud is beschrijvend en telt
 * niet apart mee voor de voorraad (zie docs/uitleendienst.md); ze staat hier
 * zodat je niet naar de detailpagina moet om te weten of de cantusset de
 * tapkraan bevat. Dicht in rust, want de meeste kaarten in de rij zijn geen set.
 */
export function SetContents({
  contents,
  locale,
}: {
  contents: Array<{ label: string; quantity: number }>;
  locale: 'nl' | 'en';
}) {
  if (contents.length === 0) return null;
  const en = locale === 'en';

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-semibold text-vtk-navy">
        {en ? `What is in it? (${contents.length})` : `Wat zit erin? (${contents.length})`}
      </summary>
      <ul className="mt-1.5 grid gap-0.5 text-xs text-vtk-muted">
        {contents.map((content) => (
          <li key={content.label} className="flex justify-between gap-3">
            <span className="truncate">{content.label}</span>
            <span className="shrink-0">{content.quantity}×</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
