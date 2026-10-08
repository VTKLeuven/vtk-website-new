import type { Metadata } from 'next';
import Link from 'next/link';
import {
  describePeriodInterval,
  describePeriodReward,
  describePeriodWindow,
  FAK_PERIOD_STATUS_LABEL,
  fakPeriodStatus,
  formatPeriodMoment,
  getFakPeriods,
} from '@/lib/fakscanner-admin';
import { FakPeriodActions } from './period-actions';

export const metadata: Metadata = { title: 'Periodes · Fakscanner' };

/**
 * De periodes van de fakscanner: voor een groot evenement telt de lezer elk uur
 * in plaats van één keer per bardag, in een eigen teller. Deze lijst is meteen de
 * historiek; een afgelopen periode blijft staan met haar stand.
 */
export default async function FakPeriodsPage() {
  const periods = await getFakPeriods();
  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="fakbar-section-head !mb-0">
          <h2>Periodes</h2>
          <p>
            Voor een groot evenement: tussen begin en einde telt de scanner per tijdvak (bv. elk uur) in plaats van
            één keer per bardag, enkel binnen een dagelijks venster en in een eigen stand. De jaarstand staat dan
            stil; na het einde telt alles weer zoals altijd.
          </p>
        </div>
        {periods.length > 0 ? (
          <Link href="/admin/fakscanner/periodes/nieuw" className="fakbar-btn fakbar-btn-primary">
            Nieuwe periode
          </Link>
        ) : null}
      </div>

      {periods.length === 0 ? (
        <div className="fakbar-empty">
          <h3>Nog geen periodes</h3>
          <p>
            Zolang er geen periode loopt, telt de scanner één check-in per bardag. Maak een periode aan voor een
            evenement waar elk uur scannen moet tellen.
          </p>
          <Link href="/admin/fakscanner/periodes/nieuw" className="fakbar-btn fakbar-btn-primary mt-2">
            Nieuwe periode
          </Link>
        </div>
      ) : (
        <div className="fakbar-table-wrap">
          <table className="fakbar-table fakbar-table-stack">
            <thead>
              <tr>
                <th>Periode</th>
                <th>Status</th>
                <th>Telt</th>
                <th>Gratis pint</th>
                <th className="num">Mensen</th>
                <th className="num">Check-ins</th>
                <th>
                  <span className="sr-only">Acties</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => {
                const status = fakPeriodStatus(period, now);
                return (
                  <tr key={period.id}>
                    <td data-label="Periode">
                      <Link
                        href={`/admin/fakscanner/periodes/${period.id}`}
                        className="font-semibold text-[var(--ink)] hover:underline"
                      >
                        {period.name}
                      </Link>
                      <span className="mt-0.5 block text-xs tabular-nums text-[var(--muted)]">
                        {formatPeriodMoment(period.startsAt)} tot {formatPeriodMoment(period.endsAt)}
                      </span>
                    </td>
                    <td data-label="Status">
                      <span
                        className="fakbar-badge"
                        data-tone={status === 'active' ? 'open' : status === 'ended' ? 'closed' : undefined}
                      >
                        {FAK_PERIOD_STATUS_LABEL[status]}
                      </span>
                    </td>
                    <td data-label="Telt">
                      {describePeriodInterval(period.intervalMinutes)}
                      <span className="mt-0.5 block text-xs tabular-nums text-[var(--muted)]">
                        {describePeriodWindow(period)}
                      </span>
                    </td>
                    <td data-label="Gratis pint">{describePeriodReward(period)}</td>
                    <td className="num tabular-nums" data-label="Mensen">
                      {period.people}
                    </td>
                    <td className="num tabular-nums" data-label="Check-ins">
                      {period.checkins}
                    </td>
                    <td data-label="">
                      <div className="flex items-center justify-end gap-1.5">
                        <FakPeriodActions
                          id={period.id}
                          name={period.name}
                          people={period.people}
                          active={status === 'active'}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
