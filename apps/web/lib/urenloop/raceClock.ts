/**
 * De klok en de urenbalk van de 24 urenloop-frontpage, zonder React.
 *
 * Los van de client-component zodat de server dezelfde eerste waarde kan
 * berekenen (zie lib/countdown.ts voor waarom dat moet) en zodat de tests er
 * zonder DOM bij kunnen.
 *
 * Anders dan de gewone aftelklok telt deze in seconden. Op de frontpage van de
 * 24 urenloop ís de klok de hero, en een reuzeklok die een minuut stilstaat,
 * leest als een klok die kapot is. Enkel `UrenloopClock` hertekent per seconde,
 * niet de hele hero.
 */

export type RacePhase = "before" | "live" | "final";

export type RaceClockParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

/** Een duur in dagen, uren, minuten en seconden; negatief telt als nul. */
export function raceClockParts(ms: number): RaceClockParts {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Uren, minuten en seconden, met de uren doorgeteld voorbij een dag: "07:40:12". */
export function formatHms(ms: number): string {
  const p = raceClockParts(ms);
  return `${pad2(p.days * 24 + p.hours)}:${pad2(p.minutes)}:${pad2(p.seconds)}`;
}

/**
 * Hoeveel uurvakjes de balk telt: de duur van de race in hele uren. Meestal 24,
 * maar start en finish komen uit /admin/24urenloop, en een balk die 24 vakjes
 * tekent voor een race van 23 uur, liegt over waar we zitten.
 */
export function raceHourCount(startsAt: Date, endsAt: Date): number {
  const hours = Math.round((endsAt.getTime() - startsAt.getTime()) / 3_600_000);
  if (!Number.isFinite(hours)) return 24;
  return Math.min(48, Math.max(1, hours));
}

/** Hoeveel uur er gelopen is, als kommagetal tussen 0 en het aantal vakjes. */
export function hoursRun(startsAt: Date, endsAt: Date, now: Date): number {
  const count = raceHourCount(startsAt, endsAt);
  const run = (now.getTime() - startsAt.getTime()) / 3_600_000;
  if (!Number.isFinite(run)) return 0;
  return Math.min(count, Math.max(0, run));
}

export type HourSegment = { state: "done" | "now" | "todo"; fill: number };

/**
 * De vakjes van de balk: gelopen, bezig (met hoe ver dat uur al is) of nog te
 * gaan. Na de finish is alles gelopen, ook wanneer de race iets korter duurde
 * dan het afgeronde aantal uren.
 */
export function hourSegments(count: number, run: number, phase: RacePhase): HourSegment[] {
  return Array.from({ length: count }, (_, i) => {
    if (phase === "final" || i + 1 <= run) return { state: "done", fill: 1 };
    if (phase === "live" && i < run) return { state: "now", fill: run - i };
    return { state: "todo", fill: 0 };
  });
}

/** Om de hoeveel vakjes er een uur onder de balk staat. */
export const HOUR_LABEL_STEP = 4;

/** De vakjes waaronder een uur staat, het eerste (de start) inbegrepen. */
export function hourLabelIndexes(count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += HOUR_LABEL_STEP) out.push(i);
  return out;
}
