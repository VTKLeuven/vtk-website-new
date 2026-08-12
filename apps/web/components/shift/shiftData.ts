'use client';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import type { Dictionary } from '@vtk/i18n';
import { parseShiftArray, type ShiftResponse } from '@/lib/shift';
import type { ToastInput } from '@/components/ui/toast';

export type ShowToast = (input: ToastInput) => void;
/** De shift-sectie van het woordenboek; doorgegeven aan helpers buiten de componenten. */
export type ShiftDict = Dictionary['shift'];

/**
 * Een shift zoals de pagina hem toont: dezelfde vorm voor een beschikbare en een
 * eigen shift, zodat weekrooster en lijst één lijst kunnen renderen.
 */
export type MergedShift = { shift: ShiftResponse; registered: boolean };

/**
 * Kleine event-bus zodat een (uit)schrijving in de ene view (rooster, lijst of
 * rail) de andere views laat herladen, zónder gedeelde wrapper-component.
 */
const shiftsChanged = new EventTarget();
function emitShiftsChanged() {
  shiftsChanged.dispatchEvent(new Event('changed'));
}

export function fmtDate(d: Date) {
  return format(d, 'dd/MM/yyyy');
}
export function fmtTime(d: Date) {
  return format(d, 'HH:mm'); // 24u; 'hh' zou 12u zonder AM/PM zijn
}
export function fmtDateTime(d: Date) {
  return format(d, 'dd/MM/yyyy HH:mm');
}

/** Vult `{placeholders}` in een vertaalde string in. */
export function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
}

/** Het aantal vrije plaatsen, ongeacht welk endpoint de shift leverde. */
export function freeSpots(shift: ShiftResponse): number {
  return shift.availableSpots ?? shift.maxParticipants - (shift.takenSpots ?? 0);
}

/** "Vol", "Nog 1 plaats", "Nog 3 plaatsen": zegt wat je eraan hebt, niet enkel 5/6. */
export function spotsLabel(shift: ShiftResponse, t: ShiftDict): string {
  const free = freeSpots(shift);
  if (free <= 0) return t.spots.full;
  if (free === 1) return t.spots.one;
  return fill(t.spots.few, { n: free });
}

/** Groen = ruim plaats, geel = bijna vol, rood = vol. */
export function spotsVariant(shift: ShiftResponse): 'success' | 'accent' | 'danger' {
  const free = freeSpots(shift);
  if (free <= 0) return 'danger';
  return free <= 2 ? 'accent' : 'success';
}

export function rewardLabel(reward: number, t: ShiftDict): string {
  return reward === 1 ? t.reward.one : fill(t.reward.many, { n: reward });
}

type ErrorBody = { error?: string; conflictShift?: { id: string; name: string } };

/** Leest JSON uit een response, of `null` als de body geen (geldige) JSON is. */
async function safeJson(resp: Response): Promise<unknown> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

/** Zet de server-foutcode om in een vertaalde reden voor de statusmelding. */
function registerErrorMessage(body: unknown, t: ShiftDict): string {
  const data = (body ?? {}) as ErrorBody;
  switch (data.error) {
    case 'Shift is full':
      return t.error.full;
    case 'Already registered for this shift':
      return t.error.alreadyRegistered;
    case 'You are already registered for an overlapping shift':
      return data.conflictShift?.name
        ? fill(t.error.overlapNamed, { name: data.conflictShift.name })
        : t.error.overlap;
    case 'Shift not found':
      return t.error.notFound;
    default:
      return t.error.registerFailed;
  }
}

/**
 * Haalt een shift-lijst op van `url`, herlaadt bij mount en telkens een view
 * een (uit)schrijving signaleert via de event-bus.
 */
export function useShiftList(url: string): ShiftResponse[] {
  const [shifts, setShifts] = useState<ShiftResponse[]>([]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      const resp = await fetch(url);
      const data = parseShiftArray(await resp.json());
      if (!ignore) setShifts(data); // discard if stale
    }

    load();
    shiftsChanged.addEventListener('changed', load);

    return () => {
      ignore = true;
      shiftsChanged.removeEventListener('changed', load);
    };
  }, [url]);

  return shifts;
}

/**
 * Schrijft de huidige user in voor een shift en toont het resultaat als toast.
 * Geeft terug of het lukte, zodat een venster zichzelf enkel bij succes sluit.
 */
export async function registerShift(
  id: string,
  showToast: ShowToast,
  t: ShiftDict
): Promise<boolean> {
  const resp = await fetch('/api/shift/register?id=' + id, { method: 'POST' });
  if (resp.ok) {
    showToast({ variant: 'success', message: t.toast.registered });
    emitShiftsChanged();
    return true;
  } else {
    showToast({ variant: 'error', message: registerErrorMessage(await safeJson(resp), t) });
    return false;
  }
}

/** Schrijft de huidige user uit voor een shift; geeft terug of het lukte. */
export async function unregisterShift(
  id: string,
  showToast: ShowToast,
  t: ShiftDict
): Promise<boolean> {
  const resp = await fetch('/api/shift/register?id=' + id, { method: 'DELETE' });
  if (resp.ok) {
    showToast({ variant: 'success', message: t.toast.unregistered });
    emitShiftsChanged();
    return true;
  } else {
    const data = (await safeJson(resp)) as ErrorBody;
    const message =
      data?.error === 'You are not registered for this shift'
        ? t.error.notRegistered
        : data?.error === 'Cannot unregister within 24 hours of the shift start'
          ? t.error.tooLateToUnregister
          : t.error.unregisterFailed;
    showToast({ variant: 'error', message });
    return false;
  }
}
