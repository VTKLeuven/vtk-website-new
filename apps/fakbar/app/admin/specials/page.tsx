import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@vtk/db';
import { ElixirIcon } from '@/components/elixir-icon';
import { formatEuro, formatShortDate } from '@/lib/fakbar-format';
import { formatWeekRange, planningFakbarWeek } from '@/lib/fakbar-week';

export const metadata: Metadata = { title: 'Specials' };

/**
 * Het weekbord: welke avond welke actie of extra drank heeft.
 *
 * Deze pagina bestaat omdat de editor alleen niet volstond. Die zit op de
 * avondtelling van één avond, en daar ga je pas naartoe *na* die avond om de
 * kassa te tellen; de specials zet je er juist *voor*. Wie ze wilde invullen,
 * moest dus raden waar ze stonden. Hier zie je de hele week in één blik en klik
 * je door naar de avond die je wil wijzigen.
 */
export default async function SpecialsPage() {
  // De week die je nog kan plannen, niet die waarin vandaag valt: op
  // zaterdag is die laatste al voorbij en kan je er niets meer voor zetten.
  const current = planningFakbarWeek(new Date());

  const week = await prisma.fakbarWeek.findUnique({
    where: { year_weekNumber: { year: current.year, weekNumber: current.week } },
    include: {
      evenings: {
        orderBy: { date: 'asc' },
        include: {
          specials: { orderBy: { sortOrder: 'asc' }, include: { item: { select: { name: true } } } },
        },
      },
    },
  });

  if (!week) {
    return (
      <div className="space-y-6">
        <div className="fakbar-section-head">
          <h2>Specials</h2>
          <p>Wat er per avond extra is aan de toog: een actie, of een drank die er anders niet staat.</p>
        </div>
        <div className="fakbar-empty">
          <h3>Week {current.week} van {current.year} staat nog niet klaar</h3>
          <p>
            Specials hangen aan een avond, dus de week moet eerst bestaan. Maak ze aan op het overzicht; daarna kan je
            hier per avond invullen wat er op het bord komt.
          </p>
          <Link href="/admin" className="fakbar-btn fakbar-btn-primary mt-2">
            Naar het overzicht
          </Link>
        </div>
      </div>
    );
  }

  const total = week.evenings.reduce((sum, evening) => sum + evening.specials.length, 0);

  return (
    <div className="space-y-6">
      <div className="fakbar-section-head">
        <h2>
          Specials week {week.weekNumber} van {week.year}
        </h2>
        <p>
          {formatWeekRange(week.startDate, week.endDate)}. Wat er per avond extra is aan de toog: een actie zoals 2+1
          gratis Stella, of een drank die er anders niet staat. Ze verschijnen op de homepagina en boven de
          drankkaart.
        </p>
      </div>

      <div className="grid gap-3">
        {week.evenings.map((evening) => (
          <div key={evening.id} className="fakbar-card !p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="flex items-baseline gap-3">
                <span className="font-semibold text-[var(--ink)]">{evening.dayOfWeek}</span>
                <span className="text-sm text-[var(--muted)]">{formatShortDate(evening.date)}</span>
                {evening.specialeActiviteit ? (
                  <span className="fakbar-badge">{evening.specialeActiviteit}</span>
                ) : null}
              </div>
              <Link
                href={`/admin/avondtelling/${evening.id}#specials`}
                className="fakbar-btn fakbar-btn-ghost !px-4 !py-2 text-[13px]"
              >
                <ElixirIcon name={evening.specials.length > 0 ? 'edit' : 'plus'} className="h-3.5 w-3.5" />
                {evening.specials.length > 0 ? 'Bewerken' : 'Toevoegen'}
              </Link>
            </div>

            {evening.specials.length > 0 ? (
              // De opvulling op een wrapper en niet op de <ul>: die krijgt in
              // globals.css `padding: 0`, en gewone CSS wint van een
              // Tailwind-utility omdat die in een layer staat.
              <div className="border-t border-[var(--line)] px-5 pb-4">
                <ul className="fakbar-special-list">
                {evening.specials.map((special) => (
                  <li key={special.id}>
                    <span className="fakbar-badge" data-tone={special.kind === 'ACTIE' ? 'open' : undefined}>
                      {special.kind === 'ACTIE' ? 'Actie' : 'Extra'}
                    </span>
                    <div className="fakbar-special-body">
                      <p className="title">{special.title}</p>
                      {special.note ? <p className="note">{special.note}</p> : null}
                    </div>
                    <p className="fakbar-special-price">
                      {special.price !== null ? (
                        formatEuro(special.price)
                      ) : (
                        <span className="text-[var(--muted)]">{special.item?.name ?? 'hele toog'}</span>
                      )}
                    </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="border-t border-[var(--line)] px-5 py-3.5 text-sm text-[var(--muted)]">
                Niets gepland voor deze avond.
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="text-sm text-[var(--muted)]">
        {total === 0
          ? 'Er staat deze week nog niets gepland. Zolang dat zo blijft, toont de site geen bord.'
          : `${total} ${total === 1 ? 'special' : 'specials'} deze week.`}
      </p>
    </div>
  );
}
