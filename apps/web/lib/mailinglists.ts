import "server-only";

import type { MailCategory, Prisma, StudyProgramme, StudyYear } from "@prisma/client";
import { prisma } from "@vtk/db";
import { nameParts } from "@vtk/auth";
import { getDictionary, type Locale } from "@vtk/i18n";
import { MAIL_CATEGORIES, STUDY_PROGRAMMES } from "@/lib/profile";
import { currentWorkingYear } from "@/lib/workingYear";

/**
 * Mailinglijst-exports voor de admin.
 *
 * Elke lijst levert dezelfde kolommen: `firstname`, `lastname`, `email`. Dat
 * mailadres is het **voorkeursadres** van het lid (universiteits- of
 * persoonlijke mail, naargelang `emailPreference`), niet per se de login-mail.
 *
 * Twee soorten lijsten:
 * - een gewone categorie (Feest, Sport, ...) en de synthetische lijst
 *   "Alle studenten" exporteren één CSV;
 * - Career exporteert een ZIP, omdat die opgesplitst wordt per studiejaar en
 *   per richting (zie {@link careerZipEntries}).
 */

/** Synthetische lijst: iedereen, los van de opt-in-categorieën. */
export const ALL_STUDENTS = "ALLE_STUDENTEN" as const;

export type MailingListId = MailCategory | typeof ALL_STUDENTS;

/** Alle lijsten die de admin-tab toont, in volgorde. */
// Bulk exports are consent-based. Operational/contractual messages must be
// sent from the relevant transaction workflow, not through an opt-in bypass.
export const MAILING_LISTS: MailingListId[] = [...MAIL_CATEGORIES];

/** Career wordt als ZIP geëxporteerd, de rest als losse CSV. */
export function isZipList(id: MailingListId): boolean {
  return id === "CAREER";
}

type RecipientRow = {
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  personalEmail: string | null;
  emailPreference: "UNIVERSITY" | "PERSONAL";
  studyYears: StudyYear[];
  studyProgrammes: StudyProgramme[];
};

export type Recipient = {
  firstname: string;
  lastname: string;
  email: string;
  studyYears: StudyYear[];
  studyProgrammes: StudyProgramme[];
};

/**
 * Wie in een lijst zit.
 *
 * Drie filters gelden voor **elke** lijst:
 * - enkel **actieve** leden: gedeactiveerde accounts horen geen mails te krijgen;
 * - enkel leden die hun studie **dit werkingsjaar bevestigd** hebben, zodat
 *   afgestudeerden vanzelf uit de lijsten vallen (zie de gate in
 *   `app/[locale]/layout.tsx`);
 * - voor alles behalve "Alle studenten" moet de categorie aangevinkt zijn.
 *
 * Gedeeld door de export en de aantallen in de admin-tab, zodat het getoonde
 * aantal niet uit elkaar kan lopen met de inhoud van de CSV.
 */
export function listWhere(id: MailingListId): Prisma.UserWhereInput {
  return {
    active: true,
    studyConfirmedYear: currentWorkingYear(),
    ...(id === ALL_STUDENTS ? {} : { mailCategories: { has: id } }),
    // Career is op faculteitsstudenten gericht: wie aangaf niet aan de
    // faculteit te studeren valt uit élke career-lijst, ook de algemene.
    ...(id === "CAREER" ? { notAtFaculty: false } : {}),
  };
}

export async function listRecipients(id: MailingListId): Promise<Recipient[]> {
  const rows: RecipientRow[] = await prisma.user.findMany({
    where: listWhere(id),
    select: {
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      personalEmail: true,
      emailPreference: true,
      studyYears: true,
      studyProgrammes: true,
    },
  });

  return rows
    .map((row) => {
      const parts = nameParts(row);
      return {
        firstname: parts.firstName,
        lastname: parts.lastName,
        // Het voorkeursadres; zonder ingevulde persoonlijke mail blijft de
        // universiteitsmail het enige bruikbare adres.
        email:
          row.emailPreference === "PERSONAL" && row.personalEmail
            ? row.personalEmail
            : row.email,
        studyYears: row.studyYears,
        studyProgrammes: row.studyProgrammes,
      };
    })
    .sort(
      (a, b) =>
        a.lastname.localeCompare(b.lastname, "nl") ||
        a.firstname.localeCompare(b.firstname, "nl")
    );
}

/** Eén CSV-veld quoten volgens RFC 4180 (komma, quote of newline erin). */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV met een `firstname,lastname,email`-header. De BOM vooraan zorgt dat Excel
 * het bestand als UTF-8 opent, zodat accenten in namen niet verminken.
 */
export function toCsv(recipients: Recipient[]): string {
  const lines = ["firstname,lastname,email"];
  for (const r of recipients) {
    lines.push([r.firstname, r.lastname, r.email].map(csvField).join(","));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

const MASTER_YEARS: StudyYear[] = ["MASTER_1", "MASTER_2"];
const BACHELOR_YEARS: StudyYear[] = ["BACHELOR_1", "BACHELOR_2", "BACHELOR_3"];

function inYears(r: Recipient, years: StudyYear[]): boolean {
  return r.studyYears.some((y) => years.includes(y));
}

/** Bestandsnaam-veilige slug van een label ("Chemische Ingenieurstechnieken" -> "chemische-ingenieurstechnieken"). */
function slug(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // accenten weg (ë -> e)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export type ZipEntry = { name: string; content: string };

/**
 * De Career-ZIP: een algemene lijst van alle Career-opt-ins, dezelfde groep
 * opgesplitst per studiejaar, en per richting nog eens 2de bachelor / 3de
 * bachelor / masters. Eerste bachelors krijgen geen eigen lijst (enkel via
 * "alle bachelors"), want daar zijn de career-activiteiten niet op gericht.
 *
 * Een lid met meerdere studiejaren of richtingen komt in elke lijst waar het bij
 * hoort; lege lijsten blijven in de ZIP zitten zodat de structuur voorspelbaar is.
 */
export function careerZipEntries(recipients: Recipient[], locale: Locale): ZipEntry[] {
  const t = getDictionary(locale).onboarding;
  const entries: ZipEntry[] = [
    { name: "career-algemeen.csv", content: toCsv(recipients) },
  ];

  // Per studiejaar over alle richtingen heen.
  const yearLists: { name: string; years: StudyYear[] }[] = [
    { name: "2de-bachelor", years: ["BACHELOR_2"] },
    { name: "3de-bachelor", years: ["BACHELOR_3"] },
    { name: "alle-bachelors", years: BACHELOR_YEARS },
    { name: "1ste-master", years: ["MASTER_1"] },
    { name: "2de-master", years: ["MASTER_2"] },
    { name: "alle-masters", years: MASTER_YEARS },
  ];
  for (const list of yearLists) {
    entries.push({
      name: `jaren/${list.name}.csv`,
      content: toCsv(recipients.filter((r) => inYears(r, list.years))),
    });
  }

  // Per richting: enkel 2de bachelor, 3de bachelor en de masters samen.
  const programmeLists: { name: string; years: StudyYear[] }[] = [
    { name: "2de-bachelor", years: ["BACHELOR_2"] },
    { name: "3de-bachelor", years: ["BACHELOR_3"] },
    { name: "masters", years: MASTER_YEARS },
  ];
  for (const programme of STUDY_PROGRAMMES) {
    const inProgramme = recipients.filter((r) => r.studyProgrammes.includes(programme));
    for (const list of programmeLists) {
      entries.push({
        name: `richtingen/${slug(t.programmes[programme])}/${list.name}.csv`,
        content: toCsv(inProgramme.filter((r) => inYears(r, list.years))),
      });
    }
  }

  return entries;
}

/** Bestandsnaam (zonder extensie) voor de download van een lijst. */
export function listFileName(id: MailingListId, locale: Locale): string {
  const t = getDictionary(locale).onboarding;
  const label = id === ALL_STUDENTS ? "alle-studenten" : slug(t.categories[id]);
  return `vtk-mailinglijst-${label}`;
}
