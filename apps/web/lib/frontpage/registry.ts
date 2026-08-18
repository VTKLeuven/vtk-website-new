import type { FieldSchema } from "./fields";

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
      eyebrowNl: { type: "text", labelNl: "Bovenschrift (NL)", labelEn: "Eyebrow (NL)" },
      eyebrowEn: { type: "text", labelNl: "Bovenschrift (EN)", labelEn: "Eyebrow (EN)" },
      titleNl: { type: "text", labelNl: "Titel (NL)", labelEn: "Title (NL)" },
      titleEn: { type: "text", labelNl: "Titel (EN)", labelEn: "Title (EN)" },
      accentNl: {
        type: "text",
        labelNl: "Geel accent (NL)",
        labelEn: "Yellow accent (NL)",
        helpNl: "Schuin en geel, midden in de titel. Leeg = geen accent.",
        helpEn: "Italic and yellow, inside the headline. Empty = no accent.",
      },
      accentEn: { type: "text", labelNl: "Geel accent (EN)", labelEn: "Yellow accent (EN)" },
      tailNl: {
        type: "text",
        labelNl: "Titel na het accent (NL)",
        labelEn: "Title after the accent (NL)",
        helpNl: 'Bij "De thuis voor ingenieurs in Leuven" is dit "in Leuven.".',
        helpEn: 'In "The home for engineers in Leuven" this is "in Leuven.".',
      },
      tailEn: {
        type: "text",
        labelNl: "Titel na het accent (EN)",
        labelEn: "Title after the accent (EN)",
      },
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
        labelNl: "Knop 2 link",
        labelEn: "Button 2 link",
        placeholder: "/eerstejaars",
      },
    },
  },
  {
    id: "urenloop",
    labelNl: "24 urenloop",
    labelEn: "24-hour run",
    descriptionNl:
      "Aftelklok over de volle breedte met een cijferrij eronder. Geen agenda; tijdens de loop telt alleen de loop.",
    descriptionEn:
      "A full-width countdown with a row of figures under it. No agenda; during the run only the run matters.",
    fields: {
      photo: {
        type: "image",
        labelNl: "Achtergrondfoto",
        labelEn: "Background photo",
        helpNl: "Een sfeerbeeld van de piste werkt beter dan een logo.",
        helpEn: "A photo of the track works better than a logo.",
        fallbackUrl: "/frontpage/urenloop.jpg",
      },
      startsAt: {
        type: "datetime",
        labelNl: "Startschot",
        labelEn: "Start",
        helpNl: "Waar de klok naartoe telt. Daarna telt ze af naar het einde.",
        helpEn: "What the clock counts down to. After that it counts to the finish.",
      },
      endsAt: {
        type: "datetime",
        labelNl: "Aankomst",
        labelEn: "Finish",
        helpNl: "24 uur later, tenzij het dit jaar anders loopt.",
        helpEn: "24 hours later, unless this year runs differently.",
      },
      editionNl: {
        type: "text",
        labelNl: "Editie (NL)",
        labelEn: "Edition (NL)",
        placeholder: "Editie 47 · Sportcomplex",
      },
      editionEn: { type: "text", labelNl: "Editie (EN)", labelEn: "Edition (EN)" },
      titleNl: { type: "text", labelNl: "Titel (NL)", labelEn: "Title (NL)" },
      titleEn: { type: "text", labelNl: "Titel (EN)", labelEn: "Title (EN)" },
      hookNl: {
        type: "text",
        labelNl: "Strijdkreet (NL)",
        labelEn: "Rallying line (NL)",
        placeholder: "Titelverdediger. Wij gaan voor de Back2Back.",
        helpNl: "Eén regel onder de klok. Leeg = geen regel.",
        helpEn: "One line under the clock. Empty = no line.",
      },
      hookEn: { type: "text", labelNl: "Strijdkreet (EN)", labelEn: "Rallying line (EN)" },
      stat1Value: {
        type: "text",
        labelNl: "Cijfer 1",
        labelEn: "Figure 1",
        placeholder: "530 m",
        helpNl: "Vrij in te vullen. Laat de waarde leeg om het vakje te verbergen.",
        helpEn: "Free text. Leave the value empty to hide the tile.",
      },
      stat1LabelNl: { type: "text", labelNl: "Cijfer 1 label (NL)", labelEn: "Figure 1 label (NL)" },
      stat1LabelEn: { type: "text", labelNl: "Cijfer 1 label (EN)", labelEn: "Figure 1 label (EN)" },
      stat2Value: { type: "text", labelNl: "Cijfer 2", labelEn: "Figure 2", placeholder: "1:23" },
      stat2LabelNl: { type: "text", labelNl: "Cijfer 2 label (NL)", labelEn: "Figure 2 label (NL)" },
      stat2LabelEn: { type: "text", labelNl: "Cijfer 2 label (EN)", labelEn: "Figure 2 label (EN)" },
      stat3Value: { type: "text", labelNl: "Cijfer 3", labelEn: "Figure 3", placeholder: "24" },
      stat3LabelNl: { type: "text", labelNl: "Cijfer 3 label (NL)", labelEn: "Figure 3 label (NL)" },
      stat3LabelEn: { type: "text", labelNl: "Cijfer 3 label (EN)", labelEn: "Figure 3 label (EN)" },
      primaryLabelNl: {
        type: "text",
        labelNl: "Knop lopers (NL)",
        labelEn: "Runners button (NL)",
        placeholder: "Kom meelopen",
        helpNl: "De loop heeft twee publieken: lopers en supporters. Eén knop per publiek.",
        helpEn: "The run has two audiences: runners and supporters. One button each.",
      },
      primaryLabelEn: { type: "text", labelNl: "Knop lopers (EN)", labelEn: "Runners button (EN)" },
      primaryUrl: { type: "url", labelNl: "Link lopers", labelEn: "Runners link" },
      secondaryLabelNl: {
        type: "text",
        labelNl: "Knop supporters (NL)",
        labelEn: "Supporters button (NL)",
        placeholder: "Kom supporteren",
      },
      secondaryLabelEn: { type: "text", labelNl: "Knop supporters (EN)", labelEn: "Supporters button (EN)" },
      secondaryUrl: { type: "url", labelNl: "Link supporters", labelEn: "Supporters link" },
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
