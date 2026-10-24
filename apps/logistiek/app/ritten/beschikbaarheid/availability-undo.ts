'use client';

import { useCallback, useTransition } from 'react';
import { restoreAvailabilityAction } from '@/app/actions/uitleen';
import { useToast } from '@/components/ui/toast';
import type { AvailabilityWindow } from './availability-editor';

/**
 * Hoe een stuk van je week eruitzag vlak voor een wijziging: genoeg om het met
 * `restoreAvailabilityAction` terug te zetten.
 */
export type AvailabilitySnapshot = {
  startAt: string;
  endAt: string;
  windows: Array<Pick<AvailabilityWindow, 'startAt' | 'endAt' | 'kind' | 'note'>>;
};

/**
 * Het stuk tussen `from` en `to` vastleggen, zoals het nu op het scherm staat.
 *
 * Het stuk moet alles dekken wat de wijziging raakt: bij het rekken van een
 * venster het oude én het nieuwe bereik. Wat de server daarbuiten samenvoegde,
 * zet `replaceRange` vanzelf terug.
 */
export function snapshotOf(
  windows: readonly AvailabilityWindow[],
  from: Date,
  to: Date
): AvailabilitySnapshot {
  return {
    startAt: from.toISOString(),
    endAt: to.toISOString(),
    windows: windows
      .filter((window) => new Date(window.startAt) < to && new Date(window.endAt) > from)
      .map(({ startAt, endAt, kind, note }) => ({ startAt, endAt, kind, note })),
  };
}

/**
 * Een melding met "Ongedaan maken" erin.
 *
 * Tekenen slaat hier meteen op, en wissen gebeurt met hetzelfde gebaar: wie per
 * ongeluk over een venster sleept met dezelfde soort, is het kwijt. Een
 * bevestiging per sleep zou het gebaar breken; deze knop maakt een misgreep
 * goed zonder dat.
 *
 * `onRestore` loopt in dezelfde transitie als het terugzetten, vóór de server
 * antwoordt: daar zet de editor de week optimistisch terug. Zonder dat stond er
 * na een klik op "Ongedaan maken" anderhalve seconde niets, en dan klik je nog
 * eens.
 */
export function useOfferUndo(onRestore?: (snapshot: AvailabilitySnapshot) => void) {
  const showToast = useToast();
  const [, startTransition] = useTransition();
  return useCallback(
    (message: string, snapshot: AvailabilitySnapshot) => {
      showToast({
        message,
        variant: 'success',
        action: {
          label: 'Ongedaan maken',
          onClick: () =>
            startTransition(async () => {
              onRestore?.(snapshot);
              const result = await restoreAvailabilityAction(snapshot);
              showToast(
                result.ok
                  ? { message: 'Teruggezet zoals het stond.', variant: 'success' }
                  : { message: result.error, variant: 'error', duration: 0 }
              );
            }),
        },
      });
    },
    [onRestore, showToast]
  );
}
