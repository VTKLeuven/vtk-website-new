"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatHms, pad2, raceClockParts, type RacePhase } from "@/lib/urenloop/raceClock";

export type UrenloopClockLabels = {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  /** "op de piste, nog", gevolgd door de resterende tijd. */
  onTrackLeft: string;
  laps: string;
  km: string;
  /** Onder het eindtotaal: "ronden in 24 uur". */
  lapsTotal: string;
  kilometres: string;
  /** Na de finish zonder stand: onder de duur van de race. */
  finished: string;
};

/** Hoe vaak de pagina tijdens de race nieuwe cijfers ophaalt; de cache van de stand is even lang. */
const LIVE_REFRESH_MS = 60_000;
/** Hoe lang we wachten voor we na een gemiste fasewissel opnieuw vragen. */
const BOUNDARY_RETRY_MS = 30_000;

/**
 * De klok van de 24 urenloop-frontpage: vóór de start het aftellen tot het
 * startschot, tijdens de race de tijd op de piste naast het aantal ronden, na de
 * finish het eindtotaal.
 *
 * `nowIso` is het moment waarop de server rendert, zodat de eerste render hier
 * exact dezelfde cijfers geeft en er geen hydration mismatch volgt; daarna telt
 * de component zelf per seconde.
 *
 * De fase zelf beslist de server, want enkel die kent de stand. Valt het
 * startschot of de finish terwijl de pagina openstaat, of loopt de race, dan
 * vraagt deze component de server om opnieuw te renderen (`router.refresh()`):
 * zo verschijnen de ronden zonder dat iemand herlaadt. Enkel in een zichtbaar
 * tabblad, zodat een vergeten tabblad niet de hele nacht de server bezighoudt.
 */
export function UrenloopClock({
  phase,
  startsAtIso,
  endsAtIso,
  nowIso,
  laps,
  km,
  labels,
}: {
  phase: RacePhase;
  startsAtIso: string;
  endsAtIso: string;
  nowIso: string;
  /** Al opgemaakt op de server; ontbreekt zolang er nog geen stand binnen is. */
  laps?: string;
  km?: string;
  labels: UrenloopClockLabels;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.parse(nowIso));
  const startsAt = Date.parse(startsAtIso);
  const endsAt = Date.parse(endsAtIso);

  useEffect(() => {
    if (phase === "final") return;
    const boundary = phase === "before" ? startsAt : endsAt;
    // Na het startschot of de finish meteen vragen, en daarna om de 30 seconden
    // opnieuw zolang de server nog de vorige fase terugstuurt (een klok die een
    // paar seconden voorloopt, of een stand die nog niet binnen is).
    let lastBoundaryTry = 0;
    let lastPoll = Date.now();
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (document.visibilityState !== "visible") return;
      if (t >= boundary && t - lastBoundaryTry >= BOUNDARY_RETRY_MS) {
        lastBoundaryTry = t;
        lastPoll = t;
        router.refresh();
      } else if (phase === "live" && t - lastPoll >= LIVE_REFRESH_MS) {
        lastPoll = t;
        router.refresh();
      }
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [phase, startsAt, endsAt, router]);

  if (phase === "before") {
    const p = raceClockParts(startsAt - now);
    const groups: Array<[number, string]> = [
      ...(p.days > 0 ? ([[p.days, labels.days]] as Array<[number, string]>) : []),
      [p.hours, labels.hours],
      [p.minutes, labels.minutes],
      [p.seconds, labels.seconds],
    ];
    return (
      <div className="fp-ul-clock">
        {groups.map(([value, label], i) => (
          <div className="fp-ul-clock-part" key={label}>
            {i > 0 ? (
              <span className="fp-ul-colon" aria-hidden="true">
                :
              </span>
            ) : null}
            <span className="fp-ul-group">
              <b>{pad2(value)}</b>
              <i>{label}</i>
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (phase === "live") {
    const elapsed = Math.min(now, endsAt) - startsAt;
    return (
      <div className="fp-ul-clock is-pair">
        <span className="fp-ul-group">
          <b>{formatHms(elapsed)}</b>
          <i>
            {labels.onTrackLeft} {formatHms(endsAt - now)}
          </i>
        </span>
        {laps ? (
          <span className="fp-ul-group is-yellow">
            <b>{laps}</b>
            <i>
              {labels.laps}
              {km ? `, ${km} ${labels.km}` : ""}
            </i>
          </span>
        ) : null}
      </div>
    );
  }

  if (!laps && !km) {
    return (
      <div className="fp-ul-clock">
        <span className="fp-ul-group">
          <b>{formatHms(endsAt - startsAt)}</b>
          <i>{labels.finished}</i>
        </span>
      </div>
    );
  }

  return (
    <div className="fp-ul-clock is-pair">
      {laps ? (
        <span className="fp-ul-group is-yellow">
          <b>{laps}</b>
          <i>{labels.lapsTotal}</i>
        </span>
      ) : null}
      {km ? (
        <span className="fp-ul-group">
          <b>{km}</b>
          <i>{labels.kilometres}</i>
        </span>
      ) : null}
    </div>
  );
}
