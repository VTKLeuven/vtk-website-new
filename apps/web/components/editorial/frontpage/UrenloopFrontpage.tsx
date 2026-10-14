import { countdownParts } from "@/lib/countdown";
import { pickField } from "@/lib/frontpage/fields";
import {
  resolvePublicUrenloopState,
  type UrenloopStatsPayload,
} from "@/lib/urenloop/stats";
import { Cta, ctaFrom, type FrontpageProps } from "./context";
import { Countdown } from "./Countdown";

function formatKm(km: number, nl: boolean): string {
  const fixed = km.toFixed(1);
  return nl ? fixed.replace(".", ",") : fixed;
}

function liveFiguresFrom(
  stats: UrenloopStatsPayload,
  nl: boolean,
): Array<{ value: string; label: string }> {
  const kmText = `${formatKm(stats.totals.km, nl)} km`;
  const totalLabel = stats.frozenAt
    ? nl
      ? `Ronden (${kmText} · bevroren)`
      : `Laps (${kmText} · frozen)`
    : nl
      ? `Ronden (${kmText})`
      : `Laps (${kmText})`;

  const figures: Array<{ value: string; label: string }> = [
    {
      value: String(stats.totals.laps),
      label: totalLabel,
    },
  ];

  const topGroup = stats.groups[0];
  const topLaps = stats.mostLaps[0];
  const topFastest = stats.fastestLap[0];

  if (topGroup) {
    figures.push({
      value: topGroup.name,
      label: nl
        ? `Beste groep · ${topGroup.laps} ${topGroup.laps === 1 ? "ronde" : "ronden"}`
        : `Leading group · ${topGroup.laps} ${topGroup.laps === 1 ? "lap" : "laps"}`,
    });
  } else if (topLaps) {
    figures.push({
      value: String(topLaps.laps),
      label: nl
        ? `Meeste ronden · ${topLaps.name}`
        : `Most laps · ${topLaps.name}`,
    });
  }

  if (topFastest) {
    figures.push({
      value: topFastest.time,
      label: nl
        ? `Snelste ronde · ${topFastest.name}`
        : `Fastest lap · ${topFastest.name}`,
    });
  } else if (topGroup && topLaps) {
    figures.push({
      value: String(topLaps.laps),
      label: nl
        ? `Meeste ronden · ${topLaps.name}`
        : `Most laps · ${topLaps.name}`,
    });
  }

  return figures;
}

/**
 * The 24-urenloop front page.
 *
 * Nothing here mirrors the default: no two-column split, no agenda card. The
 * clock is the page. It sits centred and full width, with a row of figures under
 * it, because during the run the only question anyone has is how long is left.
 *
 * Start and finish times come from `/admin/24urenloop` (with a fallback to
 * legacy field values). Before the first lap is counted, the three editorial
 * figures (`stat1`–`stat3`) are shown; once the timing laptop at the track
 * pushes standings, those three slots switch to live race numbers (total laps +
 * km, leading group, and fastest lap).
 */
export function UrenloopFrontpage({
  values,
  locale,
  base,
  now,
  urenloop,
}: FrontpageProps) {
  const nl = locale === "nl";

  const config = urenloop?.config ?? {
    startsAt: values.startsAt ?? null,
    endsAt: values.endsAt ?? null,
    showResultsUntil: null,
  };
  const publicState = resolvePublicUrenloopState(
    config,
    urenloop?.stats ?? null,
    now,
  );

  const startsAt = config.startsAt
    ? new Date(config.startsAt)
    : values.startsAt
      ? new Date(values.startsAt)
      : null;
  const endsAt =
    publicState && (publicState.phase === "live" || publicState.phase === "final")
      ? publicState.endsAt
      : config.endsAt
        ? new Date(config.endsAt)
        : values.endsAt
          ? new Date(values.endsAt)
          : null;

  const hasLiveOrFinalStats =
    publicState?.phase === "live" || publicState?.phase === "final";
  const started = hasLiveOrFinalStats || (startsAt ? now >= startsAt : false);
  const finished =
    publicState?.phase === "final" || (endsAt ? now >= endsAt : false);
  const target = !started ? startsAt : finished ? null : endsAt;

  const edition = pickField(values, "edition", locale);
  const title =
    pickField(values, "title", locale) ?? (nl ? "24 urenloop" : "24-hour run");

  const primary = ctaFrom(
    pickField(values, "primaryLabel", locale),
    values.primaryUrl,
    base,
  );
  const secondary = ctaFrom(
    pickField(values, "secondaryLabel", locale),
    values.secondaryUrl,
    base,
  );

  const hook = pickField(values, "hook", locale);

  const staticFigures = [1, 2, 3]
    .map((i) => ({
      value: values[`stat${i}Value`],
      label: pickField(values, `stat${i}Label`, locale),
    }))
    .filter((f): f is { value: string; label: string | undefined } => Boolean(f.value));

  const figures =
    publicState && (publicState.phase === "live" || publicState.phase === "final")
      ? liveFiguresFrom(publicState.stats, nl)
      : staticFigures;

  const heading = !started
    ? nl
      ? "Het startschot valt over"
      : "The start gun goes off in"
    : finished
      ? nl
        ? "De 24 uur zijn om."
        : "The 24 hours are over."
      : nl
        ? "We lopen nog"
        : "Still running for";

  return (
    <section className="home-hero fp-urenloop">
      <div>
        {edition ? (
          <div className="eyebrow">
            <span className="dot" />
            {edition}
          </div>
        ) : null}
        <h1>{title}</h1>

        <div className="fp-clock">
          <div className="fp-clock-head">{heading}</div>
          {target ? (
            <Countdown
              targetIso={target.toISOString()}
              initial={countdownParts(target, now)}
              labels={{
                days: nl ? "dagen" : "days",
                hours: nl ? "uren" : "hours",
                minutes: nl ? "min" : "min",
                passed: nl ? "Het is zover." : "It is happening.",
              }}
              variant="big"
            />
          ) : null}
        </div>

        {hook ? <p className="fp-hook">{hook}</p> : null}

        {figures.length > 0 ? (
          <div className="fp-figures">
            {figures.map((f, i) => (
              <div className="fp-figure" key={i}>
                <span className="n">{f.value}</span>
                {f.label ? <span className="l">{f.label}</span> : null}
              </div>
            ))}
          </div>
        ) : null}

        {primary || secondary ? (
          <div className="hero-cta">
            <Cta cta={primary} className="btn btn-primary arrow" />
            <Cta cta={secondary} className="btn btn-ghost" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
