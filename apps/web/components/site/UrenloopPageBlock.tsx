import type { Locale } from "@vtk/i18n";
import { countdownParts } from "@/lib/countdown";
import { Countdown } from "@/components/editorial/frontpage/Countdown";
import type { PublicUrenloopState } from "@/lib/urenloop/stats";

function formatKm(km: number, nl: boolean): string {
  const fixed = km.toFixed(1);
  return nl ? fixed.replace(".", ",") : fixed;
}

function formatClock(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Brussels",
  }).format(date);
}

function formatDateMoment(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Brussels",
  }).format(date);
}

/**
 * Het `[[24urenloop]]`-blok midden in een contentpagina.
 *
 * Drie fases zonder dat iemand tijdens de nacht een pagina moet aanpassen:
 *  - vóór de start: aftelklok naar het startschot,
 *  - tijdens de race: het huidige aantal ronden + km en de top 3 per klassement
 *    (in het laatste uur bevroren voor de spanning),
 *  - na het afsluiten van de race tot `showResultsUntil`: de eindstand.
 */
export function UrenloopPageBlock({
  state,
  locale,
  now,
}: {
  state: PublicUrenloopState;
  locale: Locale;
  now: Date;
}) {
  const nl = locale === "nl";

  if (state.phase === "countdown") {
    return (
      <section
        className="vtk-urenloop"
        aria-label={nl ? "24 urenloop aftelklok" : "24-hour run countdown"}
      >
        <div className="vtk-urenloop-head">
          <span className="vtk-urenloop-kicker">
            <span className="vtk-urenloop-dot" aria-hidden="true" />
            {nl ? "Het startschot valt over" : "The start gun goes off in"}
          </span>
          <span className="vtk-urenloop-stamp">
            {formatDateMoment(state.startsAt, locale)}
          </span>
        </div>

        <div className="vtk-urenloop-clock">
          <Countdown
            targetIso={state.startsAt.toISOString()}
            initial={countdownParts(state.startsAt, now)}
            labels={{
              days: nl ? "dagen" : "days",
              hours: nl ? "uren" : "hours",
              minutes: nl ? "min" : "min",
              passed: nl ? "Het is zover." : "It is happening.",
            }}
          />
        </div>
      </section>
    );
  }

  const { stats, receivedAt, stale, endsAt } = state;
  const isFinal = state.phase === "final";
  const isFrozen = Boolean(stats.frozenAt) && !isFinal;

  const statusText = isFinal
    ? nl
      ? "Eindstand 24 urenloop"
      : "Final standings · 24-hour run"
    : isFrozen
      ? nl
        ? "Tussenstand · bevroren voor het slotuur"
        : "Standings · frozen for the final hour"
      : nl
        ? "Live tussenstand"
        : "Live standings";

  const stampText = isFinal
    ? nl
      ? "Einduitslag"
      : "Final result"
    : isFrozen && stats.frozenAt
      ? nl
        ? `Bevroren om ${formatClock(new Date(stats.frozenAt), locale)}`
        : `Frozen at ${formatClock(new Date(stats.frozenAt), locale)}`
      : stale
        ? nl
          ? `Cijfers van ${formatClock(receivedAt, locale)}`
          : `Numbers from ${formatClock(receivedAt, locale)}`
        : nl
          ? `Bijgewerkt om ${formatClock(receivedAt, locale)}`
          : `Updated ${formatClock(receivedAt, locale)}`;

  const boards: Array<{
    key: string;
    title: string;
    rows: Array<{ name: string; value: string }>;
  }> = [
    {
      key: "mostLaps",
      title: nl ? "Meeste ronden" : "Most laps",
      rows: stats.mostLaps.slice(0, 3).map((r) => ({
        name: r.name,
        value: `${r.laps} ${nl ? (r.laps === 1 ? "ronde" : "ronden") : r.laps === 1 ? "lap" : "laps"}`,
      })),
    },
    {
      key: "fastestLap",
      title: nl ? "Snelste ronde" : "Fastest lap",
      rows: stats.fastestLap.slice(0, 3).map((r) => ({
        name: r.name,
        value: r.time,
      })),
    },
    {
      key: "firstYear",
      title: nl ? "Eerstejaars (meeste ronden)" : "First-years (most laps)",
      rows: stats.firstYearMostLaps.slice(0, 3).map((r) => ({
        name: r.name,
        value: `${r.laps} ${nl ? (r.laps === 1 ? "ronde" : "ronden") : r.laps === 1 ? "lap" : "laps"}`,
      })),
    },
    {
      key: "groups",
      title: nl ? "Groepen" : "Groups",
      rows: stats.groups.slice(0, 3).map((r) => ({
        name: r.name,
        value: `${r.laps} ${nl ? (r.laps === 1 ? "ronde" : "ronden") : r.laps === 1 ? "lap" : "laps"}`,
      })),
    },
  ].filter((board) => board.rows.length > 0);

  return (
    <section
      className="vtk-urenloop"
      aria-label={nl ? "24 urenloop tussenstand" : "24-hour run standings"}
    >
      <div className="vtk-urenloop-head">
        <span className="vtk-urenloop-kicker">
          <span
            className={`vtk-urenloop-dot${isFinal ? " is-final" : ""}`}
            aria-hidden="true"
          />
          {statusText}
        </span>
        <span className="vtk-urenloop-stamp">{stampText}</span>
      </div>

      <div className="vtk-urenloop-totals">
        <div className="vtk-urenloop-stat">
          <span className="vtk-urenloop-stat-n">{stats.totals.laps}</span>
          <span className="vtk-urenloop-stat-l">
            {nl ? "Ronden gelopen" : "Laps completed"}
          </span>
        </div>
        <div className="vtk-urenloop-stat">
          <span className="vtk-urenloop-stat-n">
            {formatKm(stats.totals.km, nl)} km
          </span>
          <span className="vtk-urenloop-stat-l">
            {nl ? "Afgelegde afstand" : "Distance covered"}
          </span>
        </div>
        {!isFinal && now < endsAt ? (
          <div className="vtk-urenloop-stat vtk-urenloop-stat-clock">
            <Countdown
              targetIso={endsAt.toISOString()}
              initial={countdownParts(endsAt, now)}
              labels={{
                days: nl ? "d" : "d",
                hours: nl ? "u" : "h",
                minutes: nl ? "min" : "min",
                passed: nl ? "24u om" : "Finished",
              }}
            />
            <span className="vtk-urenloop-stat-l">
              {nl ? "Resterende tijd" : "Time remaining"}
            </span>
          </div>
        ) : null}
      </div>

      {boards.length > 0 ? (
        <div className="vtk-urenloop-boards">
          {boards.map((board) => (
            <div className="vtk-urenloop-board" key={board.key}>
              <h3>{board.title}</h3>
              <ol>
                {board.rows.map((row, idx) => (
                  <li key={`${row.name}-${idx}`}>
                    <span className="vtk-urenloop-rank">{idx + 1}</span>
                    <span className="vtk-urenloop-name">{row.name}</span>
                    <span className="vtk-urenloop-val">{row.value}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
