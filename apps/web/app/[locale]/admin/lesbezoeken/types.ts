import type { LesbezoekStatusCode } from "@/lib/lesbezoeken";

/**
 * Eén lesbezoek zoals de clientcomponenten het krijgen.
 *
 * De tijdzone-omzetting gebeurt op de server: `day`, `minutes` en `time` staan er
 * al in Brussel-wandklok in. Zo hoeft het weekraster niet met `Date` te rekenen,
 * en toont een laptop die per ongeluk op UTC staat niet iets anders dan de rest.
 */
export type VisitView = {
  id: string;
  /** "YYYY-MM-DD" in Brussel. */
  day: string;
  /** Minuten sinds middernacht (Brussel), voor de plaats in het weekraster. */
  minutes: number;
  endMinutes: number;
  /** "11:30", al geformatteerd. */
  time: string;
  status: LesbezoekStatusCode;
  longVisit: boolean;

  organisationId: string;
  organisationName: string;
  organisationColour: string;
  /** De interne notitie bij de organisatie ("kwam vorig jaar niet opdagen"). */
  organisationNote: string | null;

  audience: string;
  course: string;
  subject: string;
  teacherNote: string;
  teacherEmail: string;
  teacherName: string | null;

  requesterName: string | null;
  requesterEmail: string | null;
  requesterPhone: string | null;

  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  professorMailedAt: string | null;
  professorNudgedAt: string | null;
  requesterNotifiedAt: string | null;
  createdAt: string;

  /** De bijzonderheden die bij deze professor of dit vak horen. */
  peculiarities: { id: string; subject: string; note: string }[];
  /** Andere aanvragen bij dezelfde professor op dezelfde dag. */
  clashes: { id: string; organisation: string; course: string; time: string }[];

  /** Taal waarin de professor standaard aangeschreven wordt; te wijzigen. */
  teacherLocale: "nl" | "en";
  /**
   * "maandag 29 september 2025" per taal, en "11:30". Al geformatteerd op de
   * server, zodat de mailopsteller in het scherm niet zelf met tijdzones rekent.
   */
  mailDate: { nl: string; en: string };
  mailTime: string;
};

export type OrganisationView = {
  id: string;
  name: string;
  colour: string;
  contactEmail: string | null;
  note: string | null;
  active: boolean;
  visitCount: number;
};

export type PeculiarityView = {
  id: string;
  subject: string;
  note: string;
};
