import { ElixirIcon } from './elixir-icon';
import { formatEuro } from '@/lib/fakbar-format';
import type { SpecialsBoardData, SpecialsDay } from '@/lib/specials';

/**
 * Het bord met wat er anders is aan de toog: vanavond, of anders de
 * eerstvolgende avonden waar iets voor gepland staat.
 *
 * Bewust een accentkaart en geen donkere band: hij staat op de homepagina
 * tussen de openingsuren en de dienstenkaarten, en een tweede donker vlak zou
 * de fotohero erboven doodslaan. De rail links is dezelfde als bij elke
 * uitgelichte kaart in dit ontwerp.
 */
export function SpecialsBoard({ board }: { board: SpecialsBoardData }) {
  const tonight = board.mode === 'tonight';

  return (
    <section className="fakbar-card fakbar-card-accent">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2.5 text-lg font-semibold text-[var(--ink)]">
          <ElixirIcon name="beer" className="h-[1.15rem] w-[1.15rem] text-[var(--yellow)]" />
          {tonight ? 'Vanavond in de fakbar' : 'Binnenkort in de fakbar'}
        </h2>
        {tonight ? <span className="text-sm text-[var(--muted)]">{formatDay(board.days[0].date)}</span> : null}
      </div>

      {board.days.map((day) => (
        <DayBlock key={day.date.toISOString()} day={day} showHeading={!tonight} />
      ))}
    </section>
  );
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('nl-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
}

function DayBlock({ day, showHeading }: { day: SpecialsDay; showHeading: boolean }) {
  return (
    <div className={showHeading ? 'mt-5 first:mt-4' : undefined}>
      {showHeading ? (
        <h3 className="text-xs font-bold uppercase tracking-[0.07em] text-[var(--yellow)]">{formatDay(day.date)}</h3>
      ) : null}

      <ul className="fakbar-special-list">
        {day.specials.map((special) => (
          <li key={special.id}>
            <span className="fakbar-badge" data-tone={special.kind === 'ACTIE' ? 'open' : undefined}>
              {special.kind === 'ACTIE' ? 'Actie' : 'Extra'}
            </span>

            <div className="fakbar-special-body">
              <p className="title">{special.title}</p>
              {special.note ? <p className="note">{special.note}</p> : null}
            </div>

            {special.price !== null ? (
              <p className="fakbar-special-price">
                {formatEuro(special.price)}
                {/* De doorstreepte gewone prijs enkel wanneer ze echt hoger is;
                    anders suggereert ze een korting die er niet is. */}
                {special.itemPrice !== null && special.itemPrice > special.price ? (
                  <s>{formatEuro(special.itemPrice)}</s>
                ) : null}
              </p>
            ) : special.itemName ? (
              <p className="fakbar-special-price">
                <span className="text-[var(--muted)]">{special.itemName}</span>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
