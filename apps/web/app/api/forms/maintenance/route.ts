import { prisma } from "@vtk/db";
import {
  enqueueDailyDigests,
  enqueueDraftReminders,
  processFormOutbox,
} from "@/lib/forms/outbox";
import { runDueGroupings } from "@/lib/forms/grouping/due";

export const runtime = "nodejs";

function secret(): string | null {
  return (
    process.env.FORMS_MAINTENANCE_SECRET?.trim() ||
    // Eén worker voor twee modules is prima: het gaat om dezelfde container en
    // dezelfde vertrouwensgrens. Zo hoeft een bestaande omgeving niets bij te
    // zetten om de formuliermail te laten vertrekken.
    process.env.TICKETING_MAINTENANCE_SECRET?.trim() ||
    null
  );
}

/**
 * Wordt periodiek aangeroepen door de worker uit `infra/docker-compose.yml`:
 * de mailwachtrij leegmaken, de dagelijkse samenvattingen klaarzetten en de
 * herinneringen voor onafgewerkte concepten. Daarnaast sluit ze de formulieren
 * met een automatische groepjesmaker waarvan alle antwoorden binnen zijn, en
 * deelt ze in.
 *
 * Geeft 503 zodra er iets blijft haperen, zodat de healthcheck van de worker
 * het merkt in plaats van stil te blijven draaien.
 */
export async function POST(request: Request) {
  const configured = secret();
  if (!configured || request.headers.get("authorization") !== `Bearer ${configured}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const digests = await enqueueDailyDigests();
  const reminders = await enqueueDraftReminders();
  const outbox = await processFormOutbox(20);
  const groupings = await runDueGroupings();
  const dead = await prisma.formOutboxMessage.count({ where: { status: "DEAD" } });

  return Response.json(
    { digests, reminders, outbox, dead, groupings: groupings.length },
    { status: outbox.failed > 0 || dead > 0 ? 503 : 200 }
  );
}
