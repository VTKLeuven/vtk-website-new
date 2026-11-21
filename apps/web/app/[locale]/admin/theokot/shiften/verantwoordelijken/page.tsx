import { notFound } from 'next/navigation';
import type { Locale } from '@vtk/i18n';
import { hasLocale } from '@/lib/locale';
import { requirePermission } from '@/lib/session';
import { parseYMD, ymdKey } from '@/lib/brussels';
import { defaultTheokotWeek, mondayOf } from '@/lib/theokotShifts';
import { DUTY_SLOTS } from '@/lib/theokotDuty';
import { loadDutyWeek } from '@/lib/theokotDuty-server';
import { formatWorkingYear } from '@/lib/workingYear';
import { WeekPicker, dayLabels } from '../WeekNav';
import { DutyRoster } from './DutyRoster';

import '@/app/design/vtk-theokot-duty.css';

/**
 * De verantwoordelijken van Theokot: wie in welk blok de zaak openhoudt. Elke
 * verantwoordelijke duidt zelf aan wanneer die kan, iemand van Theokot deelt in,
 * en de telling per werkingsjaar houdt het eerlijk. Dit verving hun rekenblad.
 * Zie docs/design-decisions.md, "Theokot: verantwoordelijken".
 */
export default async function TheokotDutyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === 'nl';
  const session = await requirePermission('theokot.manage');

  const { week } = await searchParams;
  const requested = week ? parseYMD(week) : null;
  const defaultMonday = defaultTheokotWeek(new Date());
  const monday = requested ? mondayOf(requested) : defaultMonday;
  const data = await loadDutyWeek(monday);
  const me = data.people.find((person) => person.id === session.user.id && person.member);

  const slotNames: Record<string, string> = nl
    ? { ochtend: 'Ochtend', middag: 'Middag', namiddag: 'Namiddag', avond: 'Avond' }
    : { ochtend: 'Morning', middag: 'Midday', namiddag: 'Afternoon', avond: 'Evening' };

  return (
    <DutyRoster
      key={ymdKey(monday)}
      week={ymdKey(monday)}
      year={data.year}
      yearLabel={formatWorkingYear(data.year)}
      days={data.days.map((day) => ({ key: ymdKey(day), ...dayLabels(day, nl) }))}
      slots={DUTY_SLOTS.map((slot) => ({
        key: slot.key,
        label: slotNames[slot.key],
        start: slot.start,
        end: slot.end,
      }))}
      cells={data.cells}
      people={data.people}
      meId={me?.id ?? null}
      nl={nl}
      weekPicker={
        <WeekPicker
          monday={monday}
          defaultMonday={defaultMonday}
          path={`${nl ? '' : '/en'}/admin/theokot/shiften/verantwoordelijken`}
          nl={nl}
        />
      }
    />
  );
}
