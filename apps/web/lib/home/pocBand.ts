import type { Locale } from "@vtk/i18n";
import { brusselsYMD, parseYMD, ymdKey } from "@/lib/brussels";

/**
 * De POC-band op de homepage: welke weergave er staat, en de tekst van de
 * verkiezingsweergave.
 *
 * Bewust een pure module zonder database en zonder React, net als
 * `lib/frontpage/heroShifts.ts`: hier zitten kringregels in (welke stap van de
 * procedure loopt er vandaag?) en die wil je kunnen testen zonder een homepage
 * te renderen.
 *
 * ## Waarom er twee weergaven zijn
 *
 * De band toont het hele jaar door de vertegenwoordigers van jouw richtingen.
 * Alleen: in september zijn die er nog niet. Wie dan de band ziet leegvallen,
 * krijgt geen antwoord op de vraag die hij eigenlijk heeft ("wie spreek ik aan
 * over mijn opleiding?") en al helemaal niet op de vraag die de kring op dat
 * moment stelt ("stel je kandidaat"). De redactie zet de band daarom in het
 * begin van het academiejaar op `elections`, en na de verkiezingen terug op
 * `representatives`. Zie docs/design-decisions.md.
 *
 * Het is bewust een keuze en geen automatisme. Of de verkiezingen gelopen zijn,
 * is niet af te leiden uit "heeft deze POC al vertegenwoordigers": tijdens de
 * bezwarentermijn staan de kandidaten er al in, en een POC die dit jaar niemand
 * vindt zou de hele band voor iedereen op verkiezingsmodus zetten.
 */

export const POC_BAND_SETTING = "home.poc";

/**
 * `hidden` is er voor de zomer: tussen de laatste verkiezing en het nieuwe
 * academiejaar zegt geen van beide weergaven iets zinnigs.
 */
export type PocBandMode = "representatives" | "elections" | "hidden";

const MODES: readonly PocBandMode[] = ["representatives", "elections", "hidden"];

/**
 * Eén stap van de procedure. `from` en `to` zijn dagen (`yyyy-mm-dd`) en geen
 * tijdstippen: de strook zegt in welke week je zit, niet op welk uur. Het uur
 * staat één keer, bij `deadline` hiernaast, want dat is het enige tijdstip
 * waar iemand zich echt aan moet houden.
 */
export type PocBandStep = {
  titleNl: string;
  titleEn: string;
  bodyNl: string;
  bodyEn: string;
  from: string | null;
  to: string | null;
};

export type PocBandSetting = {
  mode: PocBandMode;
  /** De kop van de band in verkiezingsmodus; de andere modus heeft een vaste kop. */
  headingNl: string;
  headingEn: string;
  /** Het regeltje rechts van de kop. */
  metaNl: string;
  metaEn: string;
  /** De titel boven de tekst in het paneel. */
  titleNl: string;
  titleEn: string;
  /** De uitleg zelf, in Markdown. */
  bodyNl: string;
  bodyEn: string;
  /** Wanneer de kandidaatstelling sluit; ISO met uur, of leeg. */
  deadline: string | null;
  ctaLabelNl: string;
  ctaLabelEn: string;
  ctaUrl: string;
  secondaryLabelNl: string;
  secondaryLabelEn: string;
  secondaryUrl: string;
  steps: PocBandStep[];
};

/** Meer stappen dan dit passen niet naast elkaar op een laptop. */
export const POC_BAND_MAX_STEPS = 4;

const DEFAULT_STEPS: PocBandStep[] = [
  {
    titleNl: "Kandidaatstelling",
    titleEn: "Put yourself forward",
    bodyNl: "Vul de form in. Je naam en richting komen daarna op de website.",
    bodyEn: "Fill in the form. Your name and programme then go on the website.",
    from: null,
    to: null,
  },
  {
    titleNl: "Bezwarentermijn",
    titleEn: "Objection period",
    bodyNl: "Iedereen kan in deze periode een bezwaar indienen bij het neutraal comité.",
    bodyEn: "During this period anyone can file an objection with the neutral committee.",
    from: null,
    to: null,
  },
  {
    titleNl: "Verkozen of verkiezing",
    titleEn: "Elected, or a vote",
    bodyNl: "Geen bezwaar betekent verkozen. Anders organiseert het neucom een stemming.",
    bodyEn: "No objection means elected. Otherwise the neucom organises a vote.",
    from: null,
    to: null,
  },
];

/** De band zoals hij eruitziet voor een site die er nog nooit iets aan instelde. */
export function defaultPocBandSetting(): PocBandSetting {
  return {
    mode: "representatives",
    headingNl: "Riververkiezingen.",
    headingEn: "Student rep elections.",
    metaNl: "",
    metaEn: "",
    titleNl: "Word jij vertegenwoordiger van je richting?",
    titleEn: "Will you represent your programme?",
    bodyNl: "",
    bodyEn: "",
    deadline: null,
    ctaLabelNl: "",
    ctaLabelEn: "",
    ctaUrl: "",
    secondaryLabelNl: "",
    secondaryLabelEn: "",
    secondaryUrl: "",
    steps: DEFAULT_STEPS.map((step) => ({ ...step })),
  };
}

function text(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

/** Een dag als `yyyy-mm-dd`, of `null`. Alles wat daar niet op lijkt, valt weg. */
function day(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Een tijdstip dat `Date` kan lezen, of `null`. */
function instant(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

/**
 * Leest de opgeslagen instelling, met de standaardwaarden voor alles wat
 * ontbreekt of niet klopt. Geeft altijd een bruikbaar object terug: een half
 * ingevulde instelling mag de homepage niet laten crashen.
 */
export function readPocBandSetting(value: unknown): PocBandSetting {
  const base = defaultPocBandSetting();
  if (typeof value !== "object" || value === null || Array.isArray(value)) return base;
  const record = value as Record<string, unknown>;

  const mode = MODES.find((candidate) => candidate === record.mode) ?? base.mode;

  const steps = Array.isArray(record.steps)
    ? record.steps
        .flatMap((item): PocBandStep[] => {
          if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
          const step = item as Record<string, unknown>;
          const titleNl = text(step, "titleNl", "").trim();
          const titleEn = text(step, "titleEn", "").trim();
          // Een stap zonder naam is geen stap; hij zou als een leeg vakje in de
          // strook komen te staan.
          if (!titleNl && !titleEn) return [];
          return [
            {
              titleNl,
              titleEn,
              bodyNl: text(step, "bodyNl", ""),
              bodyEn: text(step, "bodyEn", ""),
              from: day(step.from),
              to: day(step.to),
            },
          ];
        })
        .slice(0, POC_BAND_MAX_STEPS)
    : base.steps;

  return {
    mode,
    headingNl: text(record, "headingNl", base.headingNl),
    headingEn: text(record, "headingEn", base.headingEn),
    metaNl: text(record, "metaNl", base.metaNl),
    metaEn: text(record, "metaEn", base.metaEn),
    titleNl: text(record, "titleNl", base.titleNl),
    titleEn: text(record, "titleEn", base.titleEn),
    bodyNl: text(record, "bodyNl", base.bodyNl),
    bodyEn: text(record, "bodyEn", base.bodyEn),
    deadline: instant(record.deadline),
    ctaLabelNl: text(record, "ctaLabelNl", base.ctaLabelNl),
    ctaLabelEn: text(record, "ctaLabelEn", base.ctaLabelEn),
    ctaUrl: text(record, "ctaUrl", base.ctaUrl),
    secondaryLabelNl: text(record, "secondaryLabelNl", base.secondaryLabelNl),
    secondaryLabelEn: text(record, "secondaryLabelEn", base.secondaryLabelEn),
    secondaryUrl: text(record, "secondaryUrl", base.secondaryUrl),
    steps,
  };
}

/** De dag waarop het in Brussel is, als `yyyy-mm-dd`. */
export function brusselsDay(date: Date): string {
  return ymdKey(brusselsYMD(date));
}

/**
 * Waar we in de procedure zitten. Een stap zonder datums is nooit "nu": anders
 * zou een pas aangemaakte strook alle drie de stappen tegelijk laten oplichten.
 */
export type PocBandStepState = "done" | "now" | "upcoming";

export function pocBandStepState(step: PocBandStep, now: Date): PocBandStepState {
  if (!step.from && !step.to) return "upcoming";
  const today = brusselsDay(now);
  if (step.to && today > step.to) return "done";
  if (step.from && today < step.from) return "upcoming";
  return "now";
}

/**
 * Hoeveel hele dagen er nog zijn tot de deadline; `0` op de dag zelf en `null`
 * wanneer ze voorbij is of niet ingesteld. De teller telt kalenderdagen en geen
 * blokken van 24 uur, want "nog 1 dag" hoort morgen te betekenen, ook wanneer de
 * deadline om 23u59 valt en het nu 20u is.
 */
export function pocBandDaysLeft(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  const end = new Date(deadline);
  if (Number.isNaN(end.getTime()) || end.getTime() <= now.getTime()) return null;
  const from = Date.parse(`${brusselsDay(now)}T00:00:00Z`);
  const to = Date.parse(`${brusselsDay(end)}T00:00:00Z`);
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/** Of de kandidaatstelling nog loopt. Zonder deadline: altijd. */
export function pocBandIsOpen(setting: PocBandSetting, now: Date): boolean {
  if (!setting.deadline) return true;
  const end = new Date(setting.deadline);
  return Number.isNaN(end.getTime()) || end.getTime() > now.getTime();
}

/**
 * "tot 7 okt", "8 okt – 12 okt", "vanaf 13 okt": wanneer deze stap loopt, in zo
 * weinig mogelijk woorden. Zonder datums blijft het leeg en toont de strook
 * alleen de naam van de stap.
 */
export function pocBandStepWhen(step: PocBandStep, locale: Locale): string {
  const nl = locale === "nl";
  // Een stapdatum is een kalenderdag en geen tijdstip, dus opmaken in UTC op de
  // middag: elke andere zone zou "7 okt" een keer als 6 of 8 oktober schrijven.
  const label = (value: string) => {
    const ymd = parseYMD(value);
    if (!ymd) return value;
    return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12)).toLocaleDateString(
      nl ? "nl-BE" : "en-GB",
      { timeZone: "UTC", day: "numeric", month: "short" },
    );
  };
  if (step.from && step.to) return `${label(step.from)} – ${label(step.to)}`;
  if (step.to) return `${nl ? "tot" : "until"} ${label(step.to)}`;
  if (step.from) return `${nl ? "vanaf" : "from"} ${label(step.from)}`;
  return "";
}
