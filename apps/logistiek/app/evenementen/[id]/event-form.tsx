'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import { saveMemberEventAction } from '@/app/actions/uitleen';

/**
 * De basisgegevens van je eigen evenement bijwerken (E1).
 *
 * Enkel wat de aanvrager zelf het best weet. De naam staat er niet bij: daar
 * hangen de aanvragen met hun eigen momentopname aan, en die achteraf laten
 * verschuiven levert twee namen voor hetzelfde ding op.
 */
export function MemberEventForm({
  event,
  en,
}: {
  event: {
    id: string;
    location: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    expectedAttendance: string;
  };
  en: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(event);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const inputClass =
    'h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  function save() {
    startTransition(async () => {
      const result = await saveMemberEventAction({
        eventId: event.id,
        location: values.location,
        startDate: values.startDate,
        startTime: values.startTime,
        endDate: values.endDate,
        endTime: values.endTime,
        expectedAttendance: values.expectedAttendance,
      });
      if (!result.ok) {
        setNotice({ kind: 'error', text: result.error });
        return;
      }
      setNotice({
        kind: 'ok',
        text: result.message ?? (en ? 'Saved.' : 'Opgeslagen.'),
      });
      router.refresh();
    });
  }

  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
        {en ? 'Details of the event' : 'Gegevens van het evenement'}
      </h2>
      <p className="mt-1 text-sm text-vtk-muted">
        {en
          ? 'Logistics uses this to plan. Every request below can still have its own address and time.'
          : 'Logistiek plant hiermee. Elke aanvraag hieronder mag nog altijd een eigen adres en uur hebben.'}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-vtk-ink">{en ? 'Location' : 'Locatie'}</span>
          <input
            type="text"
            value={values.location}
            onChange={(field) => set('location', field.target.value)}
            placeholder={en ? 'E.g. Alma 2' : 'Bv. Alma 2'}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'Start day' : 'Startdag'}</span>
          <input
            type="date"
            value={values.startDate}
            onChange={(field) => set('startDate', field.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">
            {en ? 'Start time (optional)' : 'Startuur (optioneel)'}
          </span>
          <input
            type="time"
            value={values.startTime}
            onChange={(field) => set('startTime', field.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">
            {en ? 'End day (optional)' : 'Einddag (optioneel)'}
          </span>
          <input
            type="date"
            value={values.endDate}
            onChange={(field) => set('endDate', field.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">
            {en ? 'End time (optional)' : 'Einduur (optioneel)'}
          </span>
          <input
            type="time"
            value={values.endTime}
            onChange={(field) => set('endTime', field.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">
            {en ? 'Expected turnout' : 'Verwachte opkomst'}
          </span>
          <input
            type="number"
            min={0}
            value={values.expectedAttendance}
            onChange={(field) => set('expectedAttendance', field.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? (en ? 'Saving...' : 'Opslaan...') : en ? 'Save' : 'Opslaan'}
        </Button>
        {notice ? (
          <p
            role="status"
            aria-live="polite"
            className={`text-sm font-medium ${
              notice.kind === 'error' ? 'text-red-700' : 'text-vtk-ink'
            }`}
          >
            {notice.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}
