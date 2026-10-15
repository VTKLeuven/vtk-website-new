"use client";

import { useEffect, useState } from "react";
import { countdownParts, type CountdownParts } from "@/lib/countdown";

/**
 * A ticking countdown, shared by the front pages that want one.
 *
 * `initial` comes from the server so the first render here produces exactly the
 * same output and no hydration mismatch follows; after that this component
 * recomputes on its own. Without that prop the server would print one number and
 * the browser another a second later, which is precisely what React objects to.
 *
 * The timer runs at 30 seconds: the smallest unit is a minute, so updating more
 * often changes nothing on screen, and less often lets the minute visibly lag.
 */
export function Countdown({
  targetIso,
  initial,
  labels,
  variant = "panel",
  zeroWhenPassed = false,
}: {
  targetIso: string;
  initial: CountdownParts;
  labels: { days: string; hours: string; minutes: string; passed: string };
  /** "panel" sits in a dark-glass card; "big" is the page's centrepiece; "inline" sits on a bottom strip. */
  variant?: "panel" | "big" | "inline";
  /** Keep 00/00/00 on screen after the target moment instead of swapping to a text message. */
  zeroWhenPassed?: boolean;
}) {
  const [parts, setParts] = useState<CountdownParts>(initial);

  useEffect(() => {
    const target = new Date(targetIso);
    const tick = () => setParts(countdownParts(target, new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [targetIso]);

  if (parts.passed && !zeroWhenPassed) {
    return <div className="fp-countdown-passed">{labels.passed}</div>;
  }

  const displayDays = parts.passed ? 0 : parts.days;
  const displayHours = parts.passed ? 0 : parts.hours;
  const displayMinutes = parts.passed ? 0 : parts.minutes;

  const variantClass =
    variant === "big"
      ? " fp-countdown-big"
      : variant === "inline"
        ? " fp-countdown-inline"
        : "";

  return (
    <div className={`fp-countdown${variantClass}`}>
      {(
        [
          [displayDays, labels.days],
          [displayHours, labels.hours],
          [displayMinutes, labels.minutes],
        ] as const
      ).map(([value, label]) => (
        <div className="fp-count" key={label}>
          <span className="n">{String(value).padStart(2, "0")}</span>
          <span className="l">{label}</span>
        </div>
      ))}
    </div>
  );
}
