import type { FieldSchema } from "./fields";
import {
  HERO_WEEK_NEXT_LIMIT_DEFAULT,
  HERO_WEEK_NEXT_LIMIT_MAX,
  HERO_WEEK_NEXT_LIMIT_MIN,
} from "@/lib/calendar/heroWeek";

/**
 * The front pages that exist.
 *
 * A front page is the dark block at the top of the homepage. Each entry here is
 * a **complete, hand-built page** with its own component and its own CSS, free
 * to look nothing like the others. There is deliberately no shared template: VTK
 * runs a handful of takeover-worthy events a year, each designed once and reused
 * annually with new dates, so a bespoke component per event is cheap, while a
 * generic layout would flatten every event into the same shape.
 *
 * ## Adding a front page
 *
 * 1. Add an entry below with its own `fields`.
 * 2. Write the component in `components/editorial/frontpage/` and register it in
 *    that folder's `index.tsx`.
 * 3. Style it in `app/design/vtk-frontpage.css`.
 *
 * The admin form is generated from `fields`, so there is no admin work.
 *
 * This file holds **metadata only**, no components: the admin screen imports it
 * to build its forms, and should not pull the whole homepage into its bundle.
 */

export type FrontpageModule = {
  id: string;
  labelNl: string;
  labelEn: string;
  /** One sentence on what this front page is for; shown in the admin. */
  descriptionNl: string;
  descriptionEn: string;
  /** Fields this front page exposes. May be empty for a fully hardcoded page. */
  fields: FieldSchema;
};

/**
 * Last-resort photo, for a front page that declares no `fallbackUrl` of its own.
 *
 * Each front page normally ships with its own picture (see the `photo` field in
 * the entries below) so an untouched install already looks like the event it is
 * for, instead of putting the Arenberg campus behind a 24-urenloop headline.
 */
export const BUILTIN_HOME_HERO_IMAGE = "/hero-arenberg.jpg";

/** The id of the fallback: shown whenever no other front page is live. */
export const DEFAULT_FRONTPAGE_ID = "default";

/**
 * De twee agenda's die naast de titel kunnen staan.
 *
 * Het weekoverzicht staat eerst en is daarmee de terugval: het is de vorm die de
 * kring koos. De lijst blijft bestaan omdat ze in een rustige periode soms beter
 * uitkomt, en omdat een nieuwe hero die je niet kan terugdraaien geen keuze is.
 * Zie apps/web/lib/calendar/heroWeek.ts en docs/design-decisions.md.
 */
export const HOME_AGENDA_WEEK = "week";
export const HOME_AGENDA_LIST = "list";

/**
 * Standaarddonkerte van de waas achter het weekoverzicht, in procent.
 *
 * De hero-foto is rechts net het lichtst (lucht en bomen), dus de waas draagt de
 * leesbaarheid van de hele agenda. Wat hier goed staat, hangt af van de foto die
 * op dat moment ingesteld is; vandaar de schuifregelaar ernaast.
 */
export const HOME_AGENDA_DIM_DEFAULT = 88;

export const HOME_AGENDA_OPTIONS = [
  { value: HOME_AGENDA_WEEK, labelNl: "Weekoverzicht", labelEn: "Week overview" },
  { value: HOME_AGENDA_LIST, labelNl: "Lijst met eerstvolgende events", labelEn: "List of upcoming events" },
] as const;

export const FRONTPAGE_MODULES: FrontpageModule[] = [
  {
    id: DEFAULT_FRONTPAGE_ID,
    labelNl: "Standaard",
    labelEn: "Default",
    descriptionNl:
      "De gewone frontpage, met de agenda ernaast. Staat er buiten elk evenement om, en kan niet uitgezet worden.",
    descriptionEn:
      "The regular front page, with the agenda beside it. Shown outside any event, and cannot be switched off.",
    fields: {
      photo: {
        type: "image",
        labelNl: "Achtergrondfoto",
        labelEn: "Background photo",
        helpNl: "Breed en donker werkt het best; er komt een navy waas overheen.",
        helpEn: "Wide and dark works best; a navy scrim covers it.",
        fallbackUrl: BUILTIN_HOME_HERO_IMAGE,
      },
      agenda: {
        type: "choice",
        labelNl: "Agenda naast de titel",
        labelEn: "Agenda beside the headline",
        helpNl:
          "Weekoverzicht: de komende zes dagen (zaterdag valt weg), met een ster om aan te duiden dat je komt. Bij minder dan vier evenementen schakelt het vanzelf over op de eerstvolgende evenementen. Lijst: altijd de vier eerstvolgende evenementen in een kaart.",
        helpEn:
          "Week overview: the next six days (Saturday is skipped), with a star to mark that you are coming. With fewer than four events it automatically switches to the next events. List: always the next four events in a card.",
        options: HOME_AGENDA_OPTIONS,
      },
      nextEventsLimit: {
        type: "range",
        labelNl: "Maximum bij een rustige week",
        labelEn: "Maximum in a quiet week",
        helpNl:
          "Hoeveel eerstvolgende evenementen er maximaal verschijnen wanneer het weekoverzicht minder dan vier evenementen bevat. Zeven vult de beschikbare ruimte tot aan de onderkant van de shiften met dezelfde ademruimte als het weekoverzicht.",
        helpEn:
          "The maximum number of upcoming events shown when the week overview contains fewer than four events. Seven fills the available space down to the facts divider with the same spacing as the week overview.",
        min: HERO_WEEK_NEXT_LIMIT_MIN,
        max: HERO_WEEK_NEXT_LIMIT_MAX,
        step: 1,
        fallback: HERO_WEEK_NEXT_LIMIT_DEFAULT,
      },
      agendaDim: {
        type: "range",
        labelNl: "Donkerte achter het weekoverzicht",
        labelEn: "Darkness behind the week overview",
        helpNl:
          "Hoe donker de waas achter de agenda staat. Hoger bij een lichte of drukke herofoto; te hoog en de foto verdwijnt eronder. Geldt niet voor de lijst.",
        helpEn:
          "How dark the haze behind the agenda is. Raise it for a light or busy hero photo; too high and the photo disappears under it. Does not apply to the list.",
        min: 40,
        max: 100,
        step: 2,
        fallback: HOME_AGENDA_DIM_DEFAULT,
        unit: "%",
      },
      eyebrowNl: { type: "text", labelNl: "Bovenschrift (NL)", labelEn: "Eyebrow (NL)" },
      eyebrowEn: { type: "text", labelNl: "Bovenschrift (EN)", labelEn: "Eyebrow (EN)" },
      // De titel staat hier bewust niet meer. Ze is een lijst slogans geworden
      // die in /admin/slogans beheerd wordt; deze velden bleven achter als
      // invulvakken die opsloegen zonder iets te veranderen, want de slogans
      // wonnen altijd. Wat er nog in de database staat, geldt enkel zolang de
      // instelling `home.slogans` niet bestaat; zie `legacyHero` in resolve.ts.
      subtitleNl: { type: "textarea", labelNl: "Subtekst (NL)", labelEn: "Subtitle (NL)" },
      subtitleEn: { type: "textarea", labelNl: "Subtekst (EN)", labelEn: "Subtitle (EN)" },
      primaryLabelNl: { type: "text", labelNl: "Knop 1 (NL)", labelEn: "Button 1 (NL)" },
      primaryLabelEn: { type: "text", labelNl: "Knop 1 (EN)", labelEn: "Button 1 (EN)" },
      primaryUrl: {
        type: "url",
        labelNl: "Knop 1 link",
        labelEn: "Button 1 link",
        placeholder: "/aanbod",
      },
      secondaryLabelNl: { type: "text", labelNl: "Knop 2 (NL)", labelEn: "Button 2 (NL)" },
      secondaryLabelEn: { type: "text", labelNl: "Knop 2 (EN)", labelEn: "Button 2 (EN)" },
      // Twee adressen, want de twee talen sturen naar een ander publiek: een
      // Nederlandstalige bezoeker is hier een eerstejaars, wie de site op Engels
      // leest een uitwisselingsstudent. De labels stonden al per taal.
      secondaryUrl: {
        type: "url",
        labelNl: "Knop 2 link (NL)",
        labelEn: "Button 2 link (NL)",
        placeholder: "/eerstejaars",
      },
      secondaryUrlEn: {
        type: "url",
        labelNl: "Knop 2 link (EN)",
        labelEn: "Button 2 link (EN)",
        placeholder: "/internationals",
      },
    },
  },
  {
    id: "urenloop",
    labelNl: "24 urenloop",
    labelEn: "24-hour run",
    descriptionNl:
      "Het racebord: titel en klok als één blok onderaan de foto, met de 24-urenbalk eronder. Vóór de start telt de klok af tot het startschot, tijdens de race toont ze de tijd op de piste naast de ronden en het scorebord, na de finish de eindstand. Start- en aankomstuur en de stand komen uit Beheer → 24 urenloop.",
    descriptionEn:
      "The race board: headline and clock as one block at the bottom of the photo, with the 24-hour bar below. Before the start the clock counts down to the start gun, during the race it shows the time on the track next to the laps and the scoreboard, after the finish the final standings. Start and finish times and the standings come from Admin → 24-hour run.",
    fields: {
      photo: {
        type: "image",
        labelNl: "Achtergrondfoto",
        labelEn: "Background photo",
        helpNl: "Een sfeerbeeld van het standje en de piste werkt het best.",
        helpEn: "A photo of the stand and track works best.",
        fallbackUrl: "/hero-24urenloop.jpg",
      },
      titleNl: {
        type: "text",
        labelNl: "Titel (NL)",
        labelEn: "Title (NL)",
        placeholder: "24 urenloop,",
      },
      titleEn: {
        type: "text",
        labelNl: "Titel (EN)",
        labelEn: "Title (EN)",
        placeholder: "24-hour run,",
      },
      accentNl: {
        type: "text",
        labelNl: "Geel accent (NL)",
        labelEn: "Yellow accent (NL)",
        helpNl: "De tweede regel van de titel, in hetzelfde lettertype maar in het geel.",
        helpEn: "The second line of the headline, in the same typeface but in yellow.",
        placeholder: "the night is ours.",
      },
      accentEn: {
        type: "text",
        labelNl: "Geel accent (EN)",
        labelEn: "Yellow accent (EN)",
        placeholder: "the night is ours.",
      },
      place: {
        type: "text",
        labelNl: "Plaats",
        labelEn: "Place",
        helpNl: "Staat onder de urenbalk, naast start en finish. Laat leeg om weg te laten.",
        helpEn: "Shown under the hour bar, next to start and finish. Leave empty to omit.",
        placeholder: "Atletiekpiste Sportkot",
      },
      primaryUrl: {
        type: "url",
        labelNl: "Link van titel en klok",
        labelEn: "Link of headline and clock",
        helpNl: "Titel en klok zijn samen één link; er staan geen knoppen in deze hero.",
        helpEn: "Headline and clock are one link together; this hero has no buttons.",
        placeholder: "/24-urenloop",
      },
    },
  },
  {
    id: "jobfair",
    labelNl: "Jobfair",
    labelEn: "Job fair",
    descriptionNl:
      "Tekst links, een muur van bedrijfslogo's rechts. De logo's komen uit de actieve partners.",
    descriptionEn:
      "Copy on the left, a wall of company logos on the right. The logos come from the active partners.",
    fields: {
      photo: {
        type: "image",
        labelNl: "Achtergrondfoto",
        labelEn: "Background photo",
        fallbackUrl: "/frontpage/jobfair.jpg",
      },
      whenNl: {
        type: "text",
        labelNl: "Wanneer & waar (NL)",
        labelEn: "When & where (NL)",
        placeholder: "18-19 november · Alma 2",
      },
      whenEn: { type: "text", labelNl: "Wanneer & waar (EN)", labelEn: "When & where (EN)" },
      titleNl: { type: "text", labelNl: "Titel (NL)", labelEn: "Title (NL)" },
      titleEn: { type: "text", labelNl: "Titel (EN)", labelEn: "Title (EN)" },
      accentNl: { type: "text", labelNl: "Geel accent (NL)", labelEn: "Yellow accent (NL)" },
      accentEn: { type: "text", labelNl: "Geel accent (EN)", labelEn: "Yellow accent (EN)" },
      subtitleNl: { type: "textarea", labelNl: "Subtekst (NL)", labelEn: "Subtitle (NL)" },
      subtitleEn: { type: "textarea", labelNl: "Subtekst (EN)", labelEn: "Subtitle (EN)" },
      // career.vtk.be leads with its numbers inside the headline ("300 companies
      // and 3000 students"). Two free stats reproduce that without forcing the
      // sentence through a template.
      stat1Value: { type: "text", labelNl: "Cijfer 1", labelEn: "Figure 1", placeholder: "300" },
      stat1LabelNl: {
        type: "text",
        labelNl: "Cijfer 1 label (NL)",
        labelEn: "Figure 1 label (NL)",
        placeholder: "bedrijven",
      },
      stat1LabelEn: { type: "text", labelNl: "Cijfer 1 label (EN)", labelEn: "Figure 1 label (EN)" },
      stat2Value: { type: "text", labelNl: "Cijfer 2", labelEn: "Figure 2", placeholder: "3000" },
      stat2LabelNl: {
        type: "text",
        labelNl: "Cijfer 2 label (NL)",
        labelEn: "Figure 2 label (NL)",
        placeholder: "studenten",
      },
      stat2LabelEn: { type: "text", labelNl: "Cijfer 2 label (EN)", labelEn: "Figure 2 label (EN)" },
      registerLabelNl: { type: "text", labelNl: "Inschrijfknop (NL)", labelEn: "Register button (NL)" },
      registerLabelEn: { type: "text", labelNl: "Inschrijfknop (EN)", labelEn: "Register button (EN)" },
      registerUrl: {
        type: "url",
        labelNl: "Inschrijflink",
        labelEn: "Register link",
        placeholder: "https://career.vtk.be/event/vtk-jobfair",
      },
      listLabelNl: {
        type: "text",
        labelNl: "Tweede knop (NL)",
        labelEn: "Second button (NL)",
        placeholder: "Bekijk het grondplan",
      },
      listLabelEn: { type: "text", labelNl: "Tweede knop (EN)", labelEn: "Second button (EN)" },
      listUrl: { type: "url", labelNl: "Tweede link", labelEn: "Second link" },
    },
  },
  {
    id: "nieuw",
    labelNl: "Nieuw (rustige stijl)",
    labelEn: "New (calm style)",
    descriptionNl:
      "Herontwerp met een rustige achtergrond, kalender van de komende 7 dagen (inclusief zaterdag) en links uitgelijnde titel.",
    descriptionEn:
      "Redesign with a calm background, 7-day calendar (including Saturday), and left-aligned headline.",
    fields: {
      photo: {
        type: "image",
        labelNl: "Achtergrondfoto",
        labelEn: "Background photo",
        helpNl: "Rustige, donkere foto zonder storende details (standaard /hero-clean.jpg).",
        helpEn: "Calm, dark photo without distracting details (default /hero-clean.jpg).",
        fallbackUrl: "/hero-clean.jpg",
      },
      agendaTitleNl: {
        type: "text",
        labelNl: "Titel kalender (NL)",
        labelEn: "Calendar title (NL)",
        placeholder: "Komende week",
      },
      agendaTitleEn: {
        type: "text",
        labelNl: "Titel kalender (EN)",
        labelEn: "Calendar title (EN)",
        placeholder: "Upcoming week",
      },
      eyebrowNl: { type: "text", labelNl: "Bovenschrift (NL)", labelEn: "Eyebrow (NL)" },
      eyebrowEn: { type: "text", labelNl: "Bovenschrift (EN)", labelEn: "Eyebrow (EN)" },
      subtitleNl: { type: "textarea", labelNl: "Subtekst (NL)", labelEn: "Subtitle (NL)" },
      subtitleEn: { type: "textarea", labelNl: "Subtekst (EN)", labelEn: "Subtitle (EN)" },
      primaryLabelNl: { type: "text", labelNl: "Knop 1 (NL)", labelEn: "Button 1 (NL)" },
      primaryLabelEn: { type: "text", labelNl: "Knop 1 (EN)", labelEn: "Button 1 (EN)" },
      primaryUrl: {
        type: "url",
        labelNl: "Knop 1 link",
        labelEn: "Button 1 link",
        placeholder: "/aanbod",
      },
      secondaryLabelNl: { type: "text", labelNl: "Knop 2 (NL)", labelEn: "Button 2 (NL)" },
      secondaryLabelEn: { type: "text", labelNl: "Knop 2 (EN)", labelEn: "Button 2 (EN)" },
      secondaryUrl: {
        type: "url",
        labelNl: "Knop 2 link (NL)",
        labelEn: "Button 2 link (NL)",
        placeholder: "/eerstejaars",
      },
      secondaryUrlEn: {
        type: "url",
        labelNl: "Knop 2 link (EN)",
        labelEn: "Button 2 link (EN)",
        placeholder: "/internationals",
      },
    },
  },
];

/**
 * The background photo to show: the upload if there is one, otherwise whatever
 * this front page declared it ships with. One helper so the homepage, the
 * preview and the admin field cannot disagree about it.
 */
export function frontpagePhoto(
  layoutModule: FrontpageModule,
  uploadedUrl: string | null,
): string {
  return uploadedUrl ?? layoutModule.fields.photo?.fallbackUrl ?? BUILTIN_HOME_HERO_IMAGE;
}

export function getFrontpageModule(id: string): FrontpageModule | null {
  return FRONTPAGE_MODULES.find((m) => m.id === id) ?? null;
}

/** Every front page except the fallback; these are the schedulable ones. */
export function schedulableModules(): FrontpageModule[] {
  return FRONTPAGE_MODULES.filter((m) => m.id !== DEFAULT_FRONTPAGE_ID);
}
