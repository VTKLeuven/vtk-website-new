import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { nameParts } from "@vtk/auth";

/**
 * Het alumni-adresboek.
 *
 * De opt-in-mailinglijsten (`lib/mailinglists.ts`) zijn studiegericht: ze vragen
 * een studiebevestiging van dit academiejaar, en die geeft een afgestudeerde per
 * definitie nooit meer. Voor alumni is er dus een tweede bron nodig, en die
 * bestaat uit twee helften die bij de export samenkomen:
 *
 * - **Site-accounts** met `alumni` én `alumniMailOptIn`. Zij vinkten zelf aan
 *   dat ze mails willen, in de onboarding of bij de jaarlijkse bevestiging.
 * - **`AlumniContact`**: namen die de kring van reünies, oud-praesidia en
 *   inschrijvingslijsten overhoudt, zonder dat er een account aan hangt.
 *
 * Ze worden op **e-mailadres** ontdubbeld en het account wint. Een alumnus die
 * later toch een account maakt hoeft dus niet handmatig uit het adresboek
 * gehaald te worden, en niemand krijgt dezelfde mail twee keer.
 */

export type AlumniRecipient = {
  firstname: string;
  lastname: string;
  email: string;
  graduationYear: number | null;
  wasInVtk: boolean;
  /** Waar deze rij vandaan komt; de admin toont dat, de export niet. */
  source: "account" | "contact";
};

/** Normaliseer een adres voor de ontdubbeling (Brevo bewaart alles lowercase). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Wie een mail hoort te krijgen. `year` beperkt tot één lichting; alumni zonder
 * ingevuld afstudeerjaar vallen dan weg, want we weten niet of ze erbij horen.
 */
export async function listAlumniRecipients(
  options: { year?: number | null } = {},
): Promise<AlumniRecipient[]> {
  const { year } = options;

  const [accounts, contacts] = await Promise.all([
    prisma.user.findMany({
      where: {
        alumni: true,
        alumniMailOptIn: true,
        active: true,
        deletedAt: null,
        // Wie zich via een mail uitschreef, valt uit élke lijst, ook deze: Brevo
        // kent maar één uitschrijving per contact, dus "stop" tegen de
        // studentenmails is ook "stop" tegen de alumnimails.
        mailUnsubscribedAt: null,
        ...(year ? { graduationYear: year } : {}),
      },
      select: {
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        personalEmail: true,
        emailPreference: true,
        graduationYear: true,
        wasInVtk: true,
      },
    }),
    prisma.alumniContact.findMany({
      where: { unsubscribedAt: null, ...(year ? { graduationYear: year } : {}) },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        graduationYear: true,
        wasInVtk: true,
      },
    }),
  ]);

  const byEmail = new Map<string, AlumniRecipient>();

  // Accounts eerst: zij winnen bij een botsing, want daar staat een levend
  // profiel achter dat het lid zelf bijhoudt.
  for (const row of accounts) {
    const parts = nameParts(row);
    // Het voorkeursadres, net als bij de gewone mailinglijsten: een alumnus
    // leest zijn universiteitsmail per definitie niet meer.
    const email =
      row.emailPreference === "PERSONAL" && row.personalEmail ? row.personalEmail : row.email;
    byEmail.set(normalizeEmail(email), {
      firstname: parts.firstName,
      lastname: parts.lastName,
      email,
      graduationYear: row.graduationYear,
      wasInVtk: row.wasInVtk,
      source: "account",
    });
  }

  for (const row of contacts) {
    const key = normalizeEmail(row.email);
    if (byEmail.has(key)) continue;
    byEmail.set(key, {
      firstname: row.firstName,
      lastname: row.lastName,
      email: row.email,
      graduationYear: row.graduationYear,
      wasInVtk: row.wasInVtk,
      source: "contact",
    });
  }

  return [...byEmail.values()].sort(
    (a, b) =>
      (b.graduationYear ?? 0) - (a.graduationYear ?? 0) ||
      a.lastname.localeCompare(b.lastname, "nl") ||
      a.firstname.localeCompare(b.firstname, "nl"),
  );
}

/** Eén CSV-veld quoten volgens RFC 4180 (komma, quote of newline erin). */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV met dezelfde eerste drie kolommen als de gewone mailinglijst-export, plus
 * het afstudeerjaar en de VTK-vlag. De BOM vooraan zorgt dat Excel het bestand
 * als UTF-8 opent, zodat accenten in namen niet verminken.
 */
export function toAlumniCsv(recipients: AlumniRecipient[]): string {
  const lines = ["firstname,lastname,email,graduationyear,wasinvtk"];
  for (const r of recipients) {
    lines.push(
      [
        r.firstname,
        r.lastname,
        r.email,
        r.graduationYear ? String(r.graduationYear) : "",
        r.wasInVtk ? "ja" : "nee",
      ]
        .map(csvField)
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/**
 * Een alumnus met een account op de site, zoals de beheertabel hem toont.
 *
 * Staat naast `AlumniContact` en niet erin: dit is een echte gebruiker met een
 * profiel dat hij zelf bijhoudt. De beheerder kan hier één ding aan wijzigen, en
 * dat is of hij in de mailinglijst zit; naam en afstudeerjaar blijven van het lid.
 */
export type AlumniAccount = {
  id: string;
  name: string;
  /** Adres dat voor gewone alumnimail gebruikt wordt. */
  email: string;
  graduationYear: number | null;
  wasInVtk: boolean;
  optedIn: boolean;
  /**
   * Het lid schreef zichzelf uit via de link in een VTK-mail. Dan krijgt het
   * niets meer, wat de opt-in hierboven ook zegt, en kan enkel het lid zelf dat
   * terugzetten (op /account). Bewust een apart veld: een beheerder die dit niet
   * ziet, denkt dat de knop hiernaast iets doet.
   */
  selfUnsubscribed: boolean;
  active: boolean;
};

/**
 * De site-accounts met `alumni = true`.
 *
 * Ze staan bewust ook in het beheerscherm, en niet enkel in de export. Een
 * beheerder die op een reünie hoort "zet mij ook op die lijst" moet dat kunnen
 * doen zonder te weten of die persoon toevallig een account heeft; zonder deze
 * lijst zou hij een tweede rij in het adresboek aanmaken en dubbel mailen.
 */
export async function listAlumniAccounts(filter: {
  year?: number | null;
  query?: string;
}): Promise<AlumniAccount[]> {
  const where: Prisma.UserWhereInput = { alumni: true, deletedAt: null };
  if (filter.year) where.graduationYear = filter.year;
  const query = filter.query?.trim();
  if (query) {
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { personalEmail: { contains: query, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ graduationYear: "desc" }, { lastName: "asc" }, { name: "asc" }],
    take: 500,
    select: {
      id: true,
      name: true,
      email: true,
      personalEmail: true,
      emailPreference: true,
      graduationYear: true,
      wasInVtk: true,
      alumniMailOptIn: true,
      mailUnsubscribedAt: true,
      active: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.emailPreference === "PERSONAL" && row.personalEmail ? row.personalEmail : row.email,
    graduationYear: row.graduationYear,
    wasInVtk: row.wasInVtk,
    optedIn: row.alumniMailOptIn,
    selfUnsubscribed: row.mailUnsubscribedAt !== null,
    active: row.active,
  }));
}

export type AlumniYearRow = { year: number | null; contacts: number; accounts: number };

/**
 * Het overzicht per lichting, met beide bronnen apart. Bewust niet ontdubbeld:
 * dit scherm gaat over wat er in het adresboek staat, en daar wil je zien of een
 * jaar leeg is omdat er niemand is of omdat niemand nog ingevoerd werd.
 */
export async function alumniYears(): Promise<AlumniYearRow[]> {
  const [contacts, accounts] = await Promise.all([
    prisma.alumniContact.groupBy({
      by: ["graduationYear"],
      where: { unsubscribedAt: null },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["graduationYear"],
      where: { alumni: true, active: true, deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const rows = new Map<number | null, AlumniYearRow>();
  const row = (year: number | null) => {
    const existing = rows.get(year);
    if (existing) return existing;
    const fresh: AlumniYearRow = { year, contacts: 0, accounts: 0 };
    rows.set(year, fresh);
    return fresh;
  };
  for (const c of contacts) row(c.graduationYear).contacts = c._count._all;
  for (const a of accounts) row(a.graduationYear).accounts = a._count._all;

  return [...rows.values()].sort((a, b) => (b.year ?? -1) - (a.year ?? -1));
}

/** Het adresboek zelf (dus zonder de accounts), voor de beheertabel. */
export async function listAlumniContacts(filter: { year?: number | null; query?: string }): Promise<
  Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    graduationYear: number | null;
    wasInVtk: boolean;
    note: string | null;
    unsubscribedAt: Date | null;
  }>
> {
  const where: Prisma.AlumniContactWhereInput = {};
  if (filter.year) where.graduationYear = filter.year;
  const query = filter.query?.trim();
  if (query) {
    where.OR = [
      { firstName: { contains: query, mode: "insensitive" } },
      { lastName: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
    ];
  }

  return prisma.alumniContact.findMany({
    where,
    orderBy: [{ graduationYear: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    take: 500,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      graduationYear: true,
      wasInVtk: true,
      note: true,
      unsubscribedAt: true,
    },
  });
}

/**
 * Een geplakte lijst omzetten naar rijen.
 *
 * Aanvaardt komma's, puntkomma's en tabs als scheidingsteken, want wie uit Excel
 * kopieert krijgt tabs en wie uit een export komt krijgt komma's; erop staan dat
 * het één van de drie is, kost meer tijd dan alle drie aanvaarden. Een eventuele
 * kopregel wordt herkend en overgeslagen.
 *
 * Vorm: `voornaam, achternaam, e-mail[, afstudeerjaar[, in vtk]]`.
 */
export type ParsedAlumniLine = {
  line: number;
  firstName: string;
  lastName: string;
  email: string;
  graduationYear: number | null;
  wasInVtk: boolean;
};

export function parseAlumniPaste(input: string): {
  rows: ParsedAlumniLine[];
  invalid: Array<{ line: number; text: string }>;
} {
  const rows: ParsedAlumniLine[] = [];
  const invalid: Array<{ line: number; text: string }> = [];

  const lines = input.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]!.trim();
    if (!raw) continue;

    const parts = raw.split(/[;,\t]/).map((part) => part.trim());
    const [firstName, lastName, email, year, vtk] = parts;

    // Een kopregel uit een eerdere export: overslaan in plaats van als fout
    // melden, anders begint elke plak met een rode regel.
    if (i === 0 && email && /^e-?mail(adres)?$/i.test(email)) continue;

    if (!firstName || !lastName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      invalid.push({ line: i + 1, text: raw });
      continue;
    }

    const parsedYear = year && /^\d{4}$/.test(year) ? Number(year) : null;
    rows.push({
      line: i + 1,
      firstName,
      lastName,
      email: normalizeEmail(email),
      graduationYear: parsedYear,
      wasInVtk: /^(ja|yes|true|1|x|vtk)$/i.test(vtk ?? ""),
    });
  }

  return { rows, invalid };
}
