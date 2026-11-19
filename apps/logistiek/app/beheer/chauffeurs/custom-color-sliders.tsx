'use client';

import { useId } from 'react';
import { customColorCss, type CustomDriverColor } from '@/lib/driver-colors';

/** De doorsnede van de knop op de schuif, in pixels. */
const THUMB = 20;

/**
 * Een schuif met een eigen kleurverloop als baan.
 *
 * De baan is een gewoon vlak met een verloop en bovenop ligt een onzichtbare
 * `<input type="range">`: aanraken, slepen, pijltjestoetsen en screenreaders
 * werken dus zoals bij elke schuif, zonder dat een baan in drie browsers apart
 * gestijld moet worden. De ronde knop is getekend en volgt de waarde.
 *
 * Het verloop wordt met dezelfde functie getekend als de uiteindelijke kleur
 * (`customColorCss`), en rekent dus mee met de modus: wat de baan toont is wat je
 * krijgt, in het licht en in het donker.
 */
function ColorSlider({
  label,
  valueText,
  minLabel,
  maxLabel,
  min,
  max,
  value,
  onChange,
  track,
  thumb,
  disabled,
}: {
  label: string;
  /** Wat er rechts van het label staat en wat een screenreader voorleest. */
  valueText: string;
  /** Weggelaten bij de tint: dat is een cirkel, en rood staat aan beide kanten. */
  minLabel?: string;
  maxLabel?: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  track: string;
  thumb: string;
  disabled?: boolean;
}) {
  const id = useId();
  const fraction = (value - min) / (max - min);
  // De knop schuift over de baan min zijn eigen breedte, zoals bij een gewone
  // schuif: op 0% raakt hij de linkerrand, op 100% de rechterrand.
  const left = `calc(${fraction * 100}% + ${(0.5 - fraction) * THUMB}px - ${THUMB / 2}px)`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <label htmlFor={id} className="font-medium text-vtk-ink">
          {label}
        </label>
        <span aria-hidden className="tabular-nums text-vtk-muted">
          {valueText}
        </span>
      </div>
      <div
        className="relative mt-1.5 h-4 rounded-full ring-1 ring-vtk-navy/20 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-vtk-navy"
        style={{ backgroundImage: track }}
      >
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          disabled={disabled}
          aria-valuetext={`${label}: ${valueText}`}
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full border-2 border-vtk-surface shadow ring-1 ring-vtk-navy/40"
          style={{ left, width: THUMB, height: THUMB, backgroundColor: thumb }}
        />
      </div>
      {minLabel || maxLabel ? (
        <div className="mt-1 flex justify-between text-[10px] text-vtk-muted">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Een verloop van deze kleuren, gelijk verdeeld over de baan. */
function gradient(colors: string[]): string {
  return `linear-gradient(to right, ${colors.join(', ')})`;
}

/**
 * De drie schuiven voor een eigen chauffeurskleur (tint, levendigheid, kracht)
 * met een voorbeeldblok eronder.
 *
 * Het voorbeeld is geen kleurvlak maar een blok zoals in de planning: dezelfde
 * tekstkleur (`--driver-ink`) op de gekozen vulling. Dat is wat een schuif aan de
 * kant van de kracht beloofd moet blijven: dat je het uur er nog op leest.
 *
 * De component bewaart niets. De ouder houdt de keuze bij en bewaart ze pas met
 * de knop eronder: een schuif die bij elke pixel opslaat, is honderd server
 * actions voor één kleur.
 */
export function CustomColorSliders({
  value,
  onChange,
  disabled,
}: {
  value: CustomDriverColor;
  onChange: (value: CustomDriverColor) => void;
  disabled?: boolean;
}) {
  // De tintbaan toont de tinten bij een vaste, ruime levendigheid: bij 0% zou hij
  // helemaal grijs zijn en dus niets zeggen over waar je naartoe schuift.
  const hueTrack = gradient(
    Array.from({ length: 25 }, (_, step) =>
      customColorCss({ hue: Math.min(359, step * 15), chroma: 70, tone: value.tone })
    )
  );
  const chromaTrack = gradient([
    customColorCss({ ...value, chroma: 0 }),
    customColorCss({ ...value, chroma: 100 }),
  ]);
  const toneTrack = gradient([
    customColorCss({ ...value, tone: 0 }),
    customColorCss({ ...value, tone: 100 }),
  ]);
  const current = customColorCss(value);

  return (
    <div className="grid gap-3">
      <ColorSlider
        label="Tint"
        valueText={`${value.hue} graden`}
        min={0}
        max={359}
        value={value.hue}
        onChange={(hue) => onChange({ ...value, hue })}
        track={hueTrack}
        thumb={current}
        disabled={disabled}
      />
      <ColorSlider
        label="Levendigheid"
        valueText={`${value.chroma}%`}
        minLabel="Grijs"
        maxLabel="Levendig"
        min={0}
        max={100}
        value={value.chroma}
        onChange={(chroma) => onChange({ ...value, chroma })}
        track={chromaTrack}
        thumb={current}
        disabled={disabled}
      />
      <ColorSlider
        label="Kracht"
        valueText={`${value.tone}%`}
        minLabel="Zacht"
        maxLabel="Krachtig"
        min={0}
        max={100}
        value={value.tone}
        onChange={(tone) => onChange({ ...value, tone })}
        track={toneTrack}
        thumb={current}
        disabled={disabled}
      />

      <div
        className="flex h-10 items-center rounded-lg px-3 text-xs font-medium ring-1 ring-vtk-navy/20"
        style={{ backgroundColor: current, color: 'var(--driver-ink)' }}
      >
        <span className="tabular-nums">08:30</span>
        <span className="ml-2">Zo ziet een rit eruit</span>
      </div>
    </div>
  );
}
