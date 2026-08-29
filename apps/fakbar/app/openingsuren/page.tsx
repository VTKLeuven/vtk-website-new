import type { Metadata } from 'next';
import { OpeningHoursBand } from '@/components/opening-hours-band';
import { ElixirIcon } from '@/components/elixir-icon';
import { readBarStatus } from '@/lib/bar-status';
import { getElixirHours } from '@/lib/opening-hours';

export const metadata: Metadata = {
  title: 'Openingsuren',
  description: "Wanneer 't ElixIr open is tijdens het academiejaar.",
};

export const revalidate = 60;

export default async function OpeningsurenPage() {
  const [hours, status] = await Promise.all([getElixirHours(), readBarStatus()]);

  return (
    <>
      <div className="fakbar-page-head">
        <div className="fakbar-page-head-inner">
          <p className="fakbar-eyebrow">&rsquo;t ElixIr</p>
          <h1>Openingsuren</h1>
          <p className="fakbar-page-intro">
            De vaste uren tijdens het academiejaar. In blok- en examenperiodes en tijdens vakanties wijken we af; dat
            kondigen we aan via de VTK-kanalen.
          </p>
        </div>
      </div>

      <OpeningHoursBand hours={hours} showLink={false} />

      <div className="fakbar-page-content">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="fakbar-card fakbar-card-accent">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--ink)]">
              <ElixirIcon name="clock" className="h-[1.05rem] w-[1.05rem] text-[var(--muted)]" />
              Is de bar nu open?
            </h2>
            {status ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-[var(--body)]">
                  {status.isOpen
                    ? 'Er is nu activiteit gemeten in de bar; de toog is open.'
                    : 'Er wordt op dit moment geen activiteit gemeten in de bar.'}
                </p>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Gemeten via de geluidsmeter in de zaal, laatst bijgewerkt om{' '}
                  {new Date(status.lastUpdated).toLocaleTimeString('nl-BE', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Europe/Brussels',
                  })}
                  . Een indicatie, geen belofte.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-[var(--body)]">
                De live meting is op dit moment niet beschikbaar. Ga af op de uren hierboven.
              </p>
            )}
          </div>

          <div className="fakbar-card">
            <h2 className="text-lg font-semibold text-[var(--ink)]">Afwijkende uren</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--body)]">
              Cantussen, TD&rsquo;s en verhuur kunnen de gewone uren vervangen. Staat er een activiteit gepland, dan
              vind je die in de VTK-kalender.
            </p>
            <a
              className="fakbar-btn fakbar-btn-ghost mt-5"
              href={`${process.env.VTK_MAIN_URL || 'https://vtk.be'}/kalender`}
            >
              VTK-kalender
              <ElixirIcon name="external" className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
