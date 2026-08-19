import { buildIcs, type IcsEvent } from "@/lib/calendar/ics";
import type { LesbezoekStatusCode } from "@/lib/lesbezoeken";

/**
 * De agenda-export van de lesbezoeken.
 *
 * Eigen module en geen onderdeel van `lesbezoeken-server.ts`: hier gebeurt geen
 * I/O, dus zo is de export te testen zonder database (test/lesbezoeken.test.ts).
 */

/**
 * De goedgekeurde lesbezoeken als iCalendar-bestand.
 *
 * Enkel goedgekeurde: een aanvraag die nog bij de professor ligt hoort niet in de
 * agenda van wie de export importeert, want die staat er dan met een zekerheid
 * die ze niet heeft. Dat was in de oude app ook zo.
 */
export function buildLesbezoekIcs(
  visits: readonly {
    id: string;
    startsAt: Date;
    endsAt: Date;
    course: string;
    audience: string;
    subject: string;
    teacherName: string | null;
    teacherEmail: string;
    status: LesbezoekStatusCode;
    updatedAt?: Date;
    organisation: { name: string };
  }[],
  now = new Date(),
): string {
  const events: IcsEvent[] = visits
    .filter((visit) => visit.status === "APPROVED")
    .map((visit) => ({
      uid: `lesbezoek-${visit.id}@vtk.be`,
      start: visit.startsAt,
      end: visit.endsAt,
      allDay: false,
      summary: `${visit.organisation.name} — ${visit.course}`,
      description: [
        `Organisatie: ${visit.organisation.name}`,
        `Onderwerp: ${visit.subject}`,
        `Doelgroep: ${visit.audience}`,
        `Vak: ${visit.course}`,
        `Professor: ${visit.teacherName ?? visit.teacherEmail}`,
      ].join("\n"),
      categories: [visit.organisation.name],
      updatedAt: visit.updatedAt ?? now,
      // De export draagt de naam van een professor en van een organisatie; dat
      // hoort niet in een gedeelde agenda te staan alsof het publiek is.
      private: true,
    }));

  return buildIcs(
    {
      name: "VTK Lesbezoeken",
      description: "Goedgekeurde lesbezoeken, gecoördineerd door VTK Onderwijs.",
      events,
    },
    now,
  );
}
