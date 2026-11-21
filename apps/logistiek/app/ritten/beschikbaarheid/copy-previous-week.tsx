'use client';

import { useState, useTransition } from 'react';
import { ConfirmDialog } from '@vtk/ui';
import { copyPreviousWeekAvailabilityAction } from '@/app/actions/uitleen';
import { useToast } from '@vtk/ui/toast';
import { availabilityWeekBounds } from '@/lib/availability-day';
import type { AvailabilityWindow } from './availability-editor';
import { snapshotOf, useOfferUndo, type AvailabilitySnapshot } from './availability-undo';
import { UNSENT, unsentGuard } from '@vtk/ui/unsent-guard';
import { useAvailabilityCopy } from './copy';

/**
 * "Neem vorige week over": je rooster van vorige week, op dezelfde uren, in
 * deze week.
 *
 * De meeste chauffeurs rijden elke week ongeveer op dezelfde momenten, en dat
 * telkens opnieuw intekenen is precies het werk waardoor mensen het laten.
 *
 * Staat er deze week al iets, dan vervangt dit het, en dan vraagt het eerst of
 * dat mag: twee roosters over elkaar leggen geeft een week die geen van beide
 * is. Staat er niets, dan valt er niets te verliezen en gebeurt het meteen.
 * Achteraf staat er hoe dan ook "Ongedaan maken" in de melding.
 *
 * De knop is er enkel wanneer er vorige week iets stond; een knop die altijd
 * "er valt niets over te nemen" antwoordt, leert mensen op knoppen te klikken
 * die niets doen.
 */
export function CopyPreviousWeek({
  week,
  previousCount,
  windows,
  onRestore,
  className,
}: {
  /** De maandag als `YYYY-MM-DD`. */
  week: string;
  /** Hoeveel vensters er vorige week stonden. */
  previousCount: number;
  /** Wat er nu op het scherm staat, voor de bevestiging en om terug te zetten. */
  windows: readonly AvailabilityWindow[];
  /** Zie `useOfferUndo`: de week optimistisch terugzetten bij "Ongedaan maken". */
  onRestore?: (snapshot: AvailabilitySnapshot) => void;
  className?: string;
}) {
  const t = useAvailabilityCopy();
  const showToast = useToast();
  const offerUndo = useOfferUndo(onRestore);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const { weekStart, weekEnd } = availabilityWeekBounds(new Date(`${week}T00:00:00.000Z`));
  const current = windows.filter(
    (window) => new Date(window.startAt) < weekEnd && new Date(window.endAt) > weekStart
  ).length;

  if (previousCount === 0) return null;

  function run() {
    const snapshot = snapshotOf(windows, weekStart, weekEnd);
    startTransition(async () => {
      const result = await unsentGuard.run(() => copyPreviousWeekAvailabilityAction({ week }));
      if (result === UNSENT) return;
      setConfirming(false);
      if (result.ok) {
        offerUndo(result.message ?? t.copied, snapshot);
      } else {
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => (current > 0 ? setConfirming(true) : run())}
        className={className}
      >
        {pending ? t.copying : t.copyButton}
      </button>
      <ConfirmDialog
        open={confirming}
        title={t.copyTitle}
        description={t.copyDescription(current, previousCount)}
        confirmLabel={t.copyConfirm}
        cancelLabel={t.cancel}
        destructive
        pending={pending}
        onConfirm={run}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
