import Link from 'next/link';
import { ElixirIcon } from './elixir-icon';
import type { ElixirHours } from '@/lib/opening-hours';

/**
 * De openingsurenband, in dezelfde vorm als op de homepage van vtk.be: één rij
 * dagen met vandaag gemarkeerd. Zelfde gegevens ook; ze komen uit dezelfde
 * `Setting`-rij (zie lib/opening-hours.ts).
 */
export function OpeningHoursBand({ hours, showLink = true }: { hours: ElixirHours; showLink?: boolean }) {
  return (
    <section className="fakbar-band">
      <div className="fakbar-page-content !py-9">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
            <ElixirIcon name="clock" className="h-[1.05rem] w-[1.05rem] text-[var(--muted)]" />
            Openingsuren
          </h2>
          {showLink ? (
            <Link href="/openingsuren" className="text-sm font-medium text-[var(--ink)] underline underline-offset-4">
              Alle uren en uitzonderingen
            </Link>
          ) : null}
        </div>

        <dl className="fakbar-hours">
          {hours.rows.map((row) => (
            <div key={row.dayNl} className={row.isToday ? 'is-today' : undefined}>
              <dt>
                {row.dayNl}
                {row.isToday ? <span className="sr-only"> (vandaag)</span> : null}
              </dt>
              <dd>{row.hours ?? 'Gesloten'}</dd>
            </div>
          ))}
        </dl>

        {hours.note ? <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{hours.note}</p> : null}
      </div>
    </section>
  );
}
