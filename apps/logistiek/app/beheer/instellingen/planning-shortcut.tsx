'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setBezettingOpensPlanningAction } from '@/app/actions/beheer';
import { useToast } from '@vtk/ui/toast';
import { UNSENT, unsentGuard } from '@vtk/ui/unsent-guard';

/**
 * "Bezetting opent de weekplanning", voor jezelf.
 *
 * Een schakelaar die meteen bewaart, zoals Beschikbaarheid in de planning: één
 * keuze heeft geen "Opslaan" nodig. De stand gaat meteen om en terug bij een
 * fout; de melding zegt wat er nu gebeurt.
 */
export function PlanningShortcut({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const router = useRouter();

  const toggle = () => {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const result = await unsentGuard.run(() => setBezettingOpensPlanningAction(next));
      if (result === UNSENT) {
        setOn(!next);
        return;
      }
      if (result.ok) {
        showToast({ message: result.message ?? 'Opgeslagen.', variant: 'success' });
        router.refresh();
      } else {
        setOn(!next);
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  };

  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Voor jezelf</h2>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="max-w-prose">
          <p className="text-sm font-medium text-vtk-ink">Bezetting opent de weekplanning</p>
          <p className="mt-0.5 text-sm text-vtk-muted">
            &quot;Bezetting&quot; in de kop brengt je dan meteen naar de weekplanning in plaats van naar
            het bezettingsoverzicht. Enkel voor jou; de bezetting blijft bereikbaar via de link in de
            planning.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Bezetting opent de weekplanning"
          disabled={pending}
          onClick={toggle}
          className={`tg-avail-toggle${on ? ' is-on' : ''}`}
        >
          <span>{on ? 'Aan' : 'Uit'}</span>
          <span aria-hidden className="tg-switch" />
        </button>
      </div>
    </section>
  );
}
