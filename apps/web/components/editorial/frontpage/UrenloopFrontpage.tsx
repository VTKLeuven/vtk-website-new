import { countdownParts } from "@/lib/countdown";
import { pickField } from "@/lib/frontpage/fields";
import { Cta, ctaFrom, type FrontpageProps } from "./context";
import { Countdown } from "./Countdown";

/**
 * The 24-urenloop front page.
 *
 * Nothing here mirrors the default: no two-column split, no agenda card. The
 * clock is the page. It sits centred and full width, with a row of figures under
 * it, because during the run the only question anyone has is how long is left.
 *
 * The clock has three states and switches by itself, so nobody has to edit the
 * site at two in the morning:
 *  - before the start it counts down to the start,
 *  - between start and finish it counts down to the finish under a "we are
 *    running" heading,
 *  - after the finish it says so and drops to the figures alone.
 */
export function UrenloopFrontpage({ values, locale, base, now }: FrontpageProps) {
  const nl = locale === "nl";

  const startsAt = values.startsAt ? new Date(values.startsAt) : null;
  const endsAt = values.endsAt ? new Date(values.endsAt) : null;
  const started = startsAt ? now >= startsAt : false;
  const finished = endsAt ? now >= endsAt : false;
  const target = !started ? startsAt : finished ? null : endsAt;

  const edition = pickField(values, "edition", locale);
  const title = pickField(values, "title", locale) ?? (nl ? "24 urenloop" : "24-hour run");

  const primary = ctaFrom(pickField(values, "primaryLabel", locale), values.primaryUrl, base);
  const secondary = ctaFrom(pickField(values, "secondaryLabel", locale), values.secondaryUrl, base);

  const hook = pickField(values, "hook", locale);

  // Free value/label pairs rather than fixed teams/laps/runners: the real page
  // leans on figures that change per edition (530 m lap, a 1:23 Speedyteam
  // time, the number of hours), and fixed slots would only fit one of them.
  const figures = [1, 2, 3]
    .map((i) => ({
      value: values[`stat${i}Value`],
      label: pickField(values, `stat${i}Label`, locale),
    }))
    .filter((f) => f.value);

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
