import type { GroupingRole, GroupingValueKind } from "./algorithm";

/**
 * Welke rol een vraag in de groepjesmaker kan krijgen, per veldtype. Gedeeld
 * door het scherm (welke keuzes tonen) en de action (wat aanvaarden), zodat een
 * rol die het scherm niet aanbiedt ook niet via een gesmeed verzoek binnenkomt.
 */
export const GROUPING_ROLES = [
  "NAME",
  "IDENTIFIER",
  "GROUP_SIZE",
  "GROUP_NAMES",
  "PARTNER",
  "ANCHOR",
  "ACCEPTS_EXTRA",
  "SIMILAR",
  "DIVERSE",
] as const satisfies readonly GroupingRole[];

const TEXT = ["SHORT_TEXT", "LONG_TEXT", "EMAIL", "PHONE", "PROFILE"];
const CHOICE = ["SINGLE_CHOICE", "DROPDOWN", "MULTIPLE_CHOICE", "BOOLEAN"];

const ALLOWED_TYPES: Record<GroupingRole, readonly string[]> = {
  NAME: TEXT,
  IDENTIFIER: TEXT,
  GROUP_SIZE: ["NUMBER"],
  GROUP_NAMES: TEXT,
  PARTNER: TEXT,
  ANCHOR: CHOICE,
  ACCEPTS_EXTRA: CHOICE,
  SIMILAR: [...CHOICE, "NUMBER", "SCALE", "SHORT_TEXT", "PROFILE"],
  DIVERSE: [...CHOICE, "NUMBER", "SCALE", "SHORT_TEXT", "PROFILE"],
};

/** Velden die niets zeggen over een persoon: een bestand, een toestemming. */
const NEVER = new Set(["FILE", "CONSENT", "DATE", "TIME", "URL"]);

export function rolesForFieldType(type: string): GroupingRole[] {
  if (NEVER.has(type)) return [];
  return GROUPING_ROLES.filter((role) => ALLOWED_TYPES[role].includes(type));
}

/** Rollen die een lijst "ja"-opties nodig hebben. */
export function roleNeedsOptions(role: GroupingRole): boolean {
  return role === "ANCHOR" || role === "ACCEPTS_EXTRA";
}

/** Rollen waarbij het gewicht iets uitmaakt. */
export function roleHasWeight(role: GroupingRole): boolean {
  return role === "SIMILAR" || role === "DIVERSE";
}

/** Hoe het algoritme een antwoord van dit veldtype vergelijkt. */
export function valueKindForFieldType(type: string): GroupingValueKind {
  switch (type) {
    case "SINGLE_CHOICE":
    case "DROPDOWN":
      return "choice";
    case "MULTIPLE_CHOICE":
      return "multi";
    case "BOOLEAN":
    case "CONSENT":
      return "boolean";
    case "NUMBER":
    case "SCALE":
      return "number";
    default:
      return "text";
  }
}

export function roleLabel(role: GroupingRole, locale: "nl" | "en"): string {
  const nl = locale === "nl";
  switch (role) {
    case "NAME":
      return nl ? "Naam" : "Name";
    case "IDENTIFIER":
      return nl ? "Herkenning (e-mail, r-nummer)" : "Identifier (e-mail, r-number)";
    case "GROUP_SIZE":
      return nl ? "Aantal personen in de inschrijving" : "Number of people in the registration";
    case "GROUP_NAMES":
      return nl ? "Namen van de anderen (komma's)" : "Names of the others (commas)";
    case "PARTNER":
      return nl ? "Partner: wil samen met" : "Partner: wants to be with";
    case "ANCHOR":
      return nl ? "Kern van de groep (peter/meter)" : "Group core (mentor)";
    case "ACCEPTS_EXTRA":
      return nl ? "Kern aanvaardt nog anderen" : "Core accepts others";
    case "SIMILAR":
      return nl ? "Gelijk samenzetten" : "Group alike";
    case "DIVERSE":
      return nl ? "Spreiden over groepen" : "Spread across groups";
  }
}

export function roleHelp(role: GroupingRole, locale: "nl" | "en"): string {
  const nl = locale === "nl";
  switch (role) {
    case "NAME":
      return nl
        ? "Zo heet de rij in het resultaat; ook een partner kan naar deze naam verwijzen."
        : "Names the row in the result; a partner can also refer to this name.";
    case "IDENTIFIER":
      return nl
        ? "Een partner kan hiernaar verwijzen in plaats van naar de naam."
        : "A partner can refer to this instead of the name.";
    case "GROUP_SIZE":
      return nl
        ? "Met hoeveel personen deze inschrijving telt, de invuller inbegrepen. Leeg telt als 1 plus de opgesomde namen."
        : "How many people this registration counts for, including the person filling it in. Empty counts as 1 plus the listed names.";
    case "GROUP_NAMES":
      return nl
        ? "Een inschrijving met namen blijft altijd samen in dezelfde groep."
        : "A registration with names always stays together in the same group.";
    case "PARTNER":
      return nl
        ? "Zoekt de naam of het adres bij de andere inzendingen en zet die twee samen."
        : "Looks up the name or address among the other entries and keeps the two together.";
    case "ANCHOR":
      return nl
        ? "Wie een van de aangevinkte antwoorden geeft, is kern: de kern wordt eerst over de groepen verdeeld, elk met haar eigen grenzen. Een kerngroep die zich samen inschreef, krijgt een eigen groep."
        : "Whoever picks one of the checked answers is core: the core is spread over the groups first, with its own limits. A core team that registered together gets its own group.";
    case "ACCEPTS_EXTRA":
      return nl
        ? "Aangevinkt betekent ja. Een kerngroep die nee antwoordt, krijgt geen losse peters of meters bij."
        : "Checked means yes. A core team that answers no gets no individual mentors added.";
    case "SIMILAR":
      return nl
        ? "Wie hetzelfde antwoordt, komt liefst in dezelfde groep."
        : "People who answer the same end up together where possible.";
    case "DIVERSE":
      return nl
        ? "Wie hetzelfde antwoordt, komt liefst in een andere groep (bv. land van herkomst)."
        : "People who answer the same end up in different groups where possible (e.g. country).";
  }
}
