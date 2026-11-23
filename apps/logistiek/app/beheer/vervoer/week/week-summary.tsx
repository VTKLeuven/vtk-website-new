'use client';

/**
 * Wat er in deze periode nog moet gebeuren, als vaste pillen naast de titel:
 * te beslissen, zonder chauffeur, botsingen. Een klik springt naar de volgende
 * rit van die soort en opent ze; een tweede klik naar de volgende.
 *
 * **Vaste vakjes die 0 tonen, nooit een knop die verschijnt of verdwijnt.** De
 * teller met botsingen stond in de werkbalk en verdween zodra de laatste botsing
 * opgelost was; op een venster van 1536px sprong de werkbalk dan van twee rijen
 * naar één en schoof de hele kalender 40px omhoog. Hier verandert enkel het
 * getal, en een 0 grijst uit in plaats van weg te vallen.
 *
 * Elk vakje draagt een stukje van het blok waar het over gaat (de streep van
 * "te beslissen", de streepjesrand van "geen chauffeur", de rode rand van een
 * botsing), met dezelfde klassen als op de kalender: zo leer je de legende
 * zonder ze te lezen.
 */
export type SummaryKind = 'req' | 'nod' | 'clash';

export function WeekSummary({
  total,
  toDecide,
  noDriver,
  clashes,
  onStep,
}: {
  /** Het aantal ritten in beeld; `null` laat het vakje weg (de dagweergave zegt het al). */
  total: number | null;
  toDecide: number;
  noDriver: number;
  clashes: number;
  onStep: (kind: SummaryKind) => void;
}) {
  const pill =
    'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm whitespace-nowrap transition-colors';
  const idle = 'border-vtk-navy/15 bg-vtk-surface text-vtk-body enabled:hover:border-vtk-navy/40';
  const glyph = 'h-3 w-4 shrink-0 rounded-[3px] border border-vtk-navy/15';

  return (
    <div
      role="group"
      aria-label="Wat er in deze periode nog moet gebeuren"
      className="flex flex-wrap items-center gap-2"
    >
      {total !== null ? (
        <span className={`${pill} ${idle}`}>
          <b className="font-semibold tabular-nums text-vtk-ink">{total}</b>
          {total === 1 ? 'rit' : 'ritten'}
        </span>
      ) : null}
      <button
        type="button"
        disabled={toDecide === 0}
        onClick={() => onStep('req')}
        title="Naar de volgende rit die nog beslist moet worden"
        className={`${pill} ${idle} disabled:opacity-60`}
      >
        <span aria-hidden className={`${glyph} trip-requested`} style={{ backgroundColor: 'var(--driver-none)' }} />
        <b className="font-semibold tabular-nums text-vtk-ink">{toDecide}</b>
        te beslissen
      </button>
      <button
        type="button"
        disabled={noDriver === 0}
        onClick={() => onStep('nod')}
        title="Naar de volgende rit zonder chauffeur"
        className={`${pill} ${idle} disabled:opacity-60`}
      >
        <span
          aria-hidden
          className={`${glyph} border-2 trip-no-driver`}
          style={{ backgroundColor: 'var(--driver-none)' }}
        />
        <b className="font-semibold tabular-nums text-vtk-ink">{noDriver}</b>
        zonder chauffeur
      </button>
      <button
        type="button"
        disabled={clashes === 0}
        onClick={() => onStep('clash')}
        title="Naar de volgende rit die dubbel geboekt staat"
        className={`${pill} disabled:opacity-60 ${
          clashes > 0
            ? 'border-vtk-danger-line bg-vtk-danger-soft text-vtk-danger hover:bg-vtk-danger-fill'
            : idle
        }`}
      >
        <span aria-hidden className={`${glyph} border-2 border-vtk-danger bg-vtk-danger-soft`} />
        <b className="font-semibold tabular-nums">{clashes}</b>
        {clashes === 1 ? 'botsing' : 'botsingen'}
      </button>
    </div>
  );
}
