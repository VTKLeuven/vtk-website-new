'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { setAvailabilityNoteAction } from '@/app/actions/uitleen';
import { useToast } from '@/components/ui/toast';

/**
 * Eén algemene nota bij je beschikbaarheid van deze week (F4.5).
 *
 * Er bestond al een nota per venster, maar Logistiek wou er één "in het
 * algemeen, ni per individueel stukje". Wat je over een hele week te zeggen
 * hebt ("die week examens", "bel me liever dan te mailen") hoort niet bij één
 * uurvak: wie het daar toch moest zetten, koos er willekeurig één uit of schreef
 * het nergens op.
 *
 * Wat hier vastligt:
 *
 * - **Eén component voor de twee schermen.** Op een computer is het een
 *   tekstvak boven het rooster, op een telefoon één regel boven het raster.
 *   Hetzelfde veld met dezelfde regels; enkel de vorm verschilt, want op de
 *   telefoon is elke pixel er een die het raster niet krijgt.
 * - **Opslaan bij het verlaten van het veld, niet met een knop.** De rest van
 *   dit scherm slaat ook zonder knop op (je veeg is de opdracht), en een knop
 *   die er enkel voor dit ene veld staat, nodigt uit om te denken dat de rest
 *   níét bewaard is.
 * - **Maar dan wél zichtbaar.** Een veeg zie je gebeuren, tekst niet: daarom
 *   staat er "Opslaan..." en daarna even "Bewaard" naast. Zonder dat is dit een
 *   veld waarvan je nooit weet of het aankwam, en dat is precies het soort stil
 *   verlies waar deze nota tegen moet beschermen.
 * - **Leeg maken wist de nota.** Een lege nota en geen nota zijn hetzelfde.
 */

/** Hoelang "Bewaard" blijft staan; lang genoeg om te lezen, kort genoeg om te vergeten. */
const DONE_MS = 2500;

export function AvailabilityNote({
  week,
  initial,
  variant,
}: {
  /** Een dag in de week, als `YYYY-MM-DD`; de server zet er de maandag van. */
  week: string;
  /** Wat er nu opgeslagen staat, of een lege string. */
  initial: string;
  /** `paint` is de telefoonvorm: één regel, geen kaart eromheen. */
  variant: 'grid' | 'paint';
}) {
  const showToast = useToast();
  const [, startTransition] = useTransition();
  const [text, setText] = useState(initial);
  /** Wat er volgens ons op de server staat; daar vergelijken we mee bij blur. */
  const saved = useRef(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');

  // Komt er van de server iets anders terug (een andere week, of een tweede
  // tabblad), dan neemt het veld dat over zolang je er niet in staat.
  useEffect(() => {
    saved.current = initial;
    setText(initial);
  }, [initial, week]);

  useEffect(() => {
    if (status !== 'done') return;
    const timer = setTimeout(() => setStatus('idle'), DONE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  function save() {
    const next = text.trim();
    if (next === saved.current) return;
    setStatus('saving');
    startTransition(async () => {
      const result = await setAvailabilityNoteAction({ week, text: next });
      if (result.ok) {
        saved.current = next;
        setStatus('done');
      } else {
        setStatus('idle');
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  const statusLabel = status === 'saving' ? 'Opslaan...' : status === 'done' ? 'Bewaard' : null;

  if (variant === 'paint') {
    return (
      <div className="paint-note">
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={save}
          maxLength={500}
          placeholder="Nota voor deze week (optioneel)"
          aria-label="Algemene nota voor deze week"
          className="min-w-0 flex-1 rounded-full border border-vtk-navy/15 bg-vtk-field px-3 py-1 text-xs text-vtk-ink placeholder:text-vtk-muted"
        />
        {/* Vaste breedte, anders springt het veld ernaast bij elke wissel. */}
        <span className="w-14 shrink-0 text-right text-[10px] text-vtk-muted" aria-live="polite">
          {statusLabel}
        </span>
      </div>
    );
  }

  return (
    <section className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-vtk-ink">Nota voor deze week</h2>
        <span className="text-xs text-vtk-muted" aria-live="polite">
          {statusLabel}
        </span>
      </div>
      <p className="mt-1 text-xs text-vtk-muted">
        Iets dat voor de hele week geldt en niet bij één venster hoort. Logistiek leest het onder de
        beschikbaarheid in de planning. Leeg laten mag.
      </p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={save}
        maxLength={500}
        rows={2}
        placeholder="Bijvoorbeeld: die week examens, bel me liever dan te mailen."
        aria-label="Algemene nota voor deze week"
        className="mt-3 w-full rounded-lg border border-vtk-navy/15 bg-vtk-field px-3 py-2 text-sm text-vtk-ink placeholder:text-vtk-muted"
      />
    </section>
  );
}
