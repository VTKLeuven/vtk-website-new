import { HERO_WEEK_MIN_FOR_WINDOW } from "@/lib/calendar/heroWeek";
import { countdownParts } from "@/lib/countdown";
import { pickField } from "@/lib/frontpage/fields";
import { HOME_AGENDA_DIM_DEFAULT } from "@/lib/frontpage/registry";
import {
  resolvePublicUrenloopState,
  type UrenloopStatsPayload,
} from "@/lib/urenloop/stats";
import { Cta, ctaFrom, type FrontpageProps } from "./context";
import { Countdown } from "./Countdown";
import { HeroWeek } from "./HeroWeek";

function formatKm(km: number, nl: boolean): string {
  const fixed = km.toFixed(1);
  return nl ? fixed.replace(".", ",") : fixed;
}

function formatClockMoment(date: Date, nl: boolean): string {
  try {
    const dayPart = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
      timeZone: "Europe/Brussels",
      weekday: "short",
      day: "numeric",
      month: "short",
    })
      .format(date)
      .replace(/\./g, "");
    const timePart = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
      timeZone: "Europe/Brussels",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
    return nl ? `${dayPart} om ${timePart}` : `${dayPart} at ${timePart}`;
  } catch {
    return "";
  }
}

function formatShortTime(iso: string, nl: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
      timeZone: "Europe/Brussels",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return "";
  }
}

function liveFiguresFrom(
  stats: UrenloopStatsPayload,
  nl: boolean,
): Array<{ value: string; label: string }> {
  const kmText = `${formatKm(stats.totals.km, nl)} km`;
  const totalLabel = nl ? `Ronden (${kmText})` : `Laps (${kmText})`;

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
 * Keeps the middle of the photo open so the VTK stand and baton exchange stay
 * in full view, with the headline and CTA top-left, the week calendar top-right
 * before the start, and a borderless strip at the bottom carrying the countdown
 * and live race figures.
 */
export function UrenloopFrontpage({
  values,
  locale,
  base,
  now,
  weekEvents,
  signedIn,
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
  const target = !started ? startsAt : endsAt;

  const title =
    pickField(values, "title", locale) ?? (nl ? "24 urenloop," : "24-hour run,");
  const accent =
    pickField(values, "accent", locale) ??
    pickField(values, "hook", locale) ??
    "the night is ours.";
  const subtitle = pickField(values, "subtitle", locale);

  const primaryLabel =
    pickField(values, "primaryLabel", locale) ??
    (nl ? "Kom supporteren" : "Come cheer us on");
  const primaryUrl = values.primaryUrl ?? "/24-urenloop";
  const primary = ctaFrom(primaryLabel, primaryUrl, base);

  const secondary = ctaFrom(
    pickField(values, "secondaryLabel", locale),
    values.secondaryUrl,
    base,
  );

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
      ? "Start binnen"
      : "Starts in"
    : finished
      ? nl
        ? "Afgelopen"
        : "Finished"
      : nl
        ? "We lopen nog"
        : "Still running";

  let stamp = "";
  if (!started && startsAt) {
    stamp = formatClockMoment(startsAt, nl);
  } else if (finished && endsAt) {
    stamp = formatClockMoment(endsAt, nl);
  } else if (publicState && (publicState.phase === "live" || publicState.phase === "final")) {
    const t = formatShortTime(
      publicState.stats.frozenAt ?? publicState.stats.generatedAt,
      nl,
    );
    if (t) {
      stamp = publicState.stats.frozenAt
        ? nl
          ? `stand om ${t}`
          : `standings at ${t}`
        : nl
          ? `bijgewerkt om ${t}`
          : `updated at ${t}`;
    }
  }

  return (
    <section className="home-hero fp-urenloop">
      <div className="fp-urenloop-main">
        <div className="fp-urenloop-copy">
          <h1>
            {title}
            {accent ? (
              <>
                <br />
                <span className="serif">{accent}</span>
              </>
            ) : null}
          </h1>
          {subtitle ? <p className="hero-sub">{subtitle}</p> : null}
          {primary || secondary ? (
            <div className="hero-cta">
              <Cta cta={primary} className="btn btn-primary arrow" />
              <Cta cta={secondary} className="btn btn-ghost" />
            </div>
          ) : null}
        </div>

        <div className="fp-urenloop-strip">
          <div className="fp-clock">
            <div className="fp-clock-head">
              <span className="fp-clock-dot" aria-hidden="true" />
              {heading}
              {stamp ? ` (${stamp})` : ""}
            </div>
            {target ? (
              <Countdown
                targetIso={target.toISOString()}
                initial={countdownParts(target, now)}
                labels={{
                  days: nl ? "dagen" : "days",
                  hours: nl ? "uren" : "hours",
                  minutes: nl ? "min" : "min",
                  passed: "00",
                }}
                variant="inline"
                zeroWhenPassed
              />
            ) : null}
          </div>

          {figures.length > 0 ? (
            <div className="fp-urenloop-figures">
              {figures.map((f, i) => (
                <div className="fp-urenloop-figure" key={i}>
                  <span className="n">{f.value}</span>
                  {f.label ? <span className="l">{f.label}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {!started ? (
        <HeroWeek
          events={weekEvents}
          now={now}
          locale={locale}
          base={base}
          signedIn={signedIn}
          dim={HOME_AGENDA_DIM_DEFAULT}
          nextEventsLimit={HERO_WEEK_MIN_FOR_WINDOW}
          maxDays={4}
        />
      ) : null}
    </section>
  );
}
