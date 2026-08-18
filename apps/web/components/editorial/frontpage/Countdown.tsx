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
}: {
  targetIso: string;
  initial: CountdownParts;
  labels: { days: string; hours: string; minutes: string; passed: string };
  /** "panel" sits in a dark-glass card; "big" is the page's centrepiece. */
  variant?: "panel" | "big";
}) {
  const [parts, setParts] = useState<CountdownParts>(initial);

  useEffect(() => {
    const target = new Date(targetIso);
    const tick = () => setParts(countdownParts(target, new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [targetIso]);

  if (parts.passed) {
    return <div className="fp-countdown-passed">{labels.passed}</div>;
  }

  return (
    <div className={`fp-countdown${variant === "big" ? " fp-countdown-big" : ""}`}>
      {(
        [
          [parts.days, labels.days],
          [parts.hours, labels.hours],
          [parts.minutes, labels.minutes],
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
