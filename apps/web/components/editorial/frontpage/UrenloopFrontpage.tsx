import type { CSSProperties, ReactNode } from "react";
import Link from "@/components/ui/Link";
import {
  HOUR_LABEL_STEP,
  hourLabelIndexes,
  hourSegments,
  hoursRun,
  raceHourCount,
  type RacePhase,
} from "@/lib/urenloop/raceClock";
import {
  resolvePublicUrenloopState,
  type UrenloopStatsPayload,
} from "@/lib/urenloop/stats";
import { frontpageHref, type FrontpageProps } from "./context";
import { UrenloopClock } from "./UrenloopClock";

const TIME_ZONE = "Europe/Brussels";
const DAY_MS = 24 * 3_600_000;

function formatTime(date: Date, nl: boolean): string {
  return new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** "di 20 okt, 20:00": het begin en het einde van de urenbalk. */
function formatMoment(date: Date, nl: boolean): string {
  const day = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(date)
    .replace(/\./g, "");
  return `${day}, ${formatTime(date, nl)}`;
}

function formatNumber(n: number, nl: boolean, decimals = 0): string {
  return new Intl.NumberFormat(nl ? "nl-BE" : "en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

type Marker = { text: string; warn: boolean };

/**
 * De urenbalk onder de klok: één vakje per uur van de race, met start en finish
 * aan de uiteinden en de plaats eronder. Tijdens de race staat er een
 * markering boven het lopende uur; die vervangt de pil die eerst boven de klok
 * stond.
 */
function RaceBar({
  startsAt,
  endsAt,
  now,
  phase,
  marker,
  nl,
}: {
  startsAt: Date;
  endsAt: Date;
  now: Date;
  phase: RacePhase;
  marker: Marker | null;
  nl: boolean;
}) {
  const count = raceHourCount(startsAt, endsAt);
  const run = hoursRun(startsAt, endsAt, now);
  const segments = hourSegments(count, run, phase);
  const columns = { "--fp-ul-hours": count } as CSSProperties;
  const progress =
    phase === "before"
      ? nl
        ? "Nog niet gestart"
        : "Not started yet"
      : phase === "final"
        ? nl
          ? "Afgelopen"
          : "Finished"
        : nl
          ? `Uur ${Math.min(count, Math.floor(run) + 1)} van ${count}`
          : `Hour ${Math.min(count, Math.floor(run) + 1)} of ${count}`;

  return (
    <div className="fp-ul-bar">
      {marker ? (
        <span
          className={`fp-ul-mark${marker.warn ? " is-warn" : ""}`}
          style={{ left: `${Math.min(96, Math.max(4, (run / count) * 100)).toFixed(2)}%` }}
        >
          <span className="fp-ul-mark-dot" aria-hidden="true" />
          {marker.text}
        </span>
      ) : null}
      <div className="fp-ul-segments" style={columns} role="img" aria-label={progress}>
        {segments.map((segment, i) => (
          <span
            key={i}
            className="fp-ul-seg"
            data-state={segment.state}
            style={
              segment.state === "now"
                ? ({ "--fp-ul-fill": `${Math.round(segment.fill * 100)}%` } as CSSProperties)
                : undefined
            }
          />
        ))}
      </div>
      <div className="fp-ul-hours" style={columns}>
        {hourLabelIndexes(count).map((i) => (
          <span
            key={i}
            className={i === 0 ? "is-start" : count - i <= HOUR_LABEL_STEP + 1 ? "is-late" : undefined}
            style={{ gridColumn: `${i + 1} / span ${Math.min(HOUR_LABEL_STEP, count - i)}` }}
          >
            {i === 0
              ? formatMoment(startsAt, nl)
              : formatTime(new Date(startsAt.getTime() + i * 3_600_000), nl)}
          </span>
        ))}
        <span className="is-end">{formatMoment(endsAt, nl)}</span>
      </div>
    </div>
  );
}

/** De eerste plaats per klassement, naast elkaar; een leeg klassement valt weg. */
function Scoreboard({ stats, nl }: { stats: UrenloopStatsPayload; nl: boolean }) {
  const lapsText = (laps: number) => formatNumber(laps, nl);
  const cells = [
    stats.fastestLap[0] && {
      key: "fastest",
      label: nl ? "Snelste rondje" : "Fastest lap",
      value: stats.fastestLap[0].time,
      name: stats.fastestLap[0].name,
    },
    stats.mostLaps[0] && {
      key: "most",
      label: nl ? "Meeste rondjes" : "Most laps",
      value: lapsText(stats.mostLaps[0].laps),
      name: stats.mostLaps[0].name,
    },
    stats.firstYearMostLaps[0] && {
      key: "firstYear",
      label: nl ? "Beste eerstejaar" : "Best first-year",
      value: lapsText(stats.firstYearMostLaps[0].laps),
      name: stats.firstYearMostLaps[0].name,
    },
    stats.groups[0] && {
      key: "group",
      label: nl ? "Beste groep" : "Best group",
      value: lapsText(stats.groups[0].laps),
      name: stats.groups[0].name,
    },
  ].filter((cell): cell is { key: string; label: string; value: string; name: string } => Boolean(cell));

  if (cells.length === 0) return null;
  return (
    <dl className="fp-ul-board">
      {cells.map((cell) => (
        <div key={cell.key}>
          <dt>{cell.label}</dt>
          <dd>
            <b>{cell.value}</b>
            <span>{cell.name}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * De 24-urenloop-frontpage: het racebord.
 *
 * Titel en klok vormen samen één link, met de urenbalk en tijdens de race de
 * scorebordrij eronder, als één blok onderaan de foto. De klok is de hero: ze
 * telt af tot het startschot, toont tijdens de race de tijd op de piste naast
 * het aantal ronden en na de finish het eindtotaal. Start en finish komen uit
 * Beheer → 24 urenloop, de stand van de piste-laptop.
 *
 * Gekozen uit een reeks richtingen, met een paar bewuste weglatingen: geen
 * serif-accent, geen pil boven de klok, geen knoppen en geen kalender. Zie
 * docs/design-decisions.md, "De 24 urenloop-frontpage".
 */
export function UrenloopFrontpage({ locale, base, now, urenloop }: FrontpageProps) {
  const nl = locale === "nl";

  const config = urenloop?.config ?? { startsAt: null, endsAt: null, showResultsUntil: null };
  const publicState = resolvePublicUrenloopState(config, urenloop?.stats ?? null, now);
  const race = publicState && publicState.phase !== "countdown" ? publicState : null;

  const startsAt = config.startsAt ? new Date(config.startsAt) : null;
  const plannedEnd = race?.endsAt ?? (config.endsAt ? new Date(config.endsAt) : null);
  const endsAt = plannedEnd ?? (startsAt ? new Date(startsAt.getTime() + DAY_MS) : null);

  const phase: RacePhase =
    race?.phase === "final" || (endsAt && now >= endsAt)
      ? "final"
      : race || (startsAt && now >= startsAt)
        ? "live"
        : "before";

  const title = nl ? "24 urenloop," : "24-hour run,";
  const accent = "the night is ours.";
  const link = frontpageHref("/24-urenloop", base);

  const stats = race?.stats ?? null;
  let marker: Marker | null = null;
  if (phase === "live" && startsAt && endsAt) {
    const hour = Math.min(raceHourCount(startsAt, endsAt), Math.floor(hoursRun(startsAt, endsAt, now)) + 1);
    if (race?.stale) {
      const at = formatTime(race.receivedAt, nl);
      marker = { text: nl ? `cijfers van ${at}` : `numbers from ${at}`, warn: true };
    } else if (stats?.frozenAt) {
      marker = {
        text: nl ? "stand bevroren voor het slotuur" : "standings frozen for the final hour",
        warn: false,
      };
    } else {
      marker = { text: nl ? `live, uur ${hour}` : `live, hour ${hour}`, warn: false };
    }
  }

  const heading: ReactNode = (
    <>
      <h1 className="fp-ul-title">
        {title}
        {accent ? (
          <>
            <br />
            <span className="fp-ul-accent">{accent}</span>
          </>
        ) : null}
      </h1>
      {startsAt && endsAt ? (
        <UrenloopClock
          phase={phase}
          startsAtIso={startsAt.toISOString()}
          endsAtIso={endsAt.toISOString()}
          nowIso={now.toISOString()}
          laps={stats ? formatNumber(stats.totals.laps, nl) : undefined}
          km={stats ? formatNumber(stats.totals.km, nl, 1) : undefined}
          labels={{
            days: nl ? "dagen" : "days",
            hours: nl ? "uur" : "hours",
            minutes: "min",
            seconds: "sec",
            laps: nl ? "rondjes" : "laps",
            km: "km",
            kilometres: nl ? "kilometer" : "kilometres",
            finished: nl ? "gelopen" : "run",
          }}
        />
      ) : null}
    </>
  );

  return (
    <section className="home-hero fp-urenloop">
      <div className="fp-ul-block">
        {link?.external ? (
          <a href={link.href} className="fp-ul-link">
            {heading}
          </a>
        ) : link ? (
          <Link href={link.href} className="fp-ul-link">
            {heading}
          </Link>
        ) : (
          <div className="fp-ul-link">{heading}</div>
        )}
        {startsAt && endsAt ? (
          <RaceBar
            startsAt={startsAt}
            endsAt={endsAt}
            now={now}
            phase={phase}
            marker={marker}
            nl={nl}
          />
        ) : null}
        {stats && phase !== "before" ? <Scoreboard stats={stats} nl={nl} /> : null}
      </div>
    </section>
  );
}
