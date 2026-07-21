import { prisma } from "@vtk/db";
import { CUDI_SHIFT_SOURCE } from "@/lib/cudiShiftMirror";

/**
 * Roster-terugkoppeling van de main site naar cudi.vtk.be: schrijft een lid zich
 * hier in/uit voor een cursusdienst-shift (een gespiegelde `Shift` met
 * `sourceSystem = "cudi"`), dan duwen we dat naar cudi zodat hun
 * shift-verantwoordelijken de roster houden. Identiteit gaat via het r-nummer
 * (met e-mail als terugval), dat cudi zelf oplost/provisioneert.
 *
 * **Volledig optioneel.** Zonder `CUDI_SYNC_SECRET` doet dit niets en gedraagt
 * de inschrijfflow zich exact zoals vroeger (`skipped: true`). Is de integratie
 * wél aan, dan wordt de inschrijving blokkerend afgehandeld: lukt de cudi-call
 * niet, dan draait de aanroeper de native inschrijving terug (zie de shift-
 * register-route). Zie docs/design-decisions.md, "Cursusdienst-shiften op de main site".
 */

const CUDI_ORIGIN = process.env.CURSUSDIENST_ORIGIN || "https://cudi.vtk.be";

type Action = "register" | "unregister";

export type PushResult = {
  /** Geslaagd óf overgeslagen (integratie uit): de aanroeper mag doorgaan. */
  ok: boolean;
  /** True wanneer de integratie niet geconfigureerd is; dan is er niets gebeurd. */
  skipped?: boolean;
  status?: number;
  error?: string;
};

async function registrantForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { rNumber: true, email: true, firstName: true, lastName: true, name: true },
  });
  if (!user) return null;
  return {
    rNumber: user.rNumber,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.name,
  };
}

async function postToCudi(payload: unknown): Promise<{ ok: boolean; status: number; error?: string }> {
  const secret = process.env.CUDI_SYNC_SECRET;
  // Integratie uit: laat de aanroeper native doorgaan (geen blokkade).
  if (!secret) return { ok: true, status: 0 };
  try {
    const res = await fetch(`${CUDI_ORIGIN}/api/integrations/main/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, status: res.status, error: body.error };
    }
    return { ok: true, status: res.status };
  } catch {
    return { ok: false, status: 503, error: "cudi unreachable" };
  }
}

/**
 * Duw één in-/uitschrijving naar cudi. Geeft `skipped` terug wanneer de
 * integratie uit staat; anders `ok` afhankelijk van de cudi-respons.
 */
export async function pushCudiRegistration(action: Action, sourceId: string, userId: string): Promise<PushResult> {
  if (!process.env.CUDI_SYNC_SECRET) return { ok: true, skipped: true };
  const registrant = await registrantForUser(userId);
  if (!registrant) return { ok: false, error: "user not found" };
  const result = await postToCudi({ action, sourceId, registrant });
  return { ok: result.ok, status: result.status, error: result.error };
}

/**
 * Vangnet: duw de volledige roster-set van alle komende cursusdienst-shiften naar
 * cudi (upsert + prune). Bedoeld voor een cron/maintenance-trigger, zodat een
 * zeldzame gemiste per-actie-push alsnog rechtgezet wordt.
 */
export async function reconcileCudiRegistrations(): Promise<{ shifts: number } | { error: string }> {
  if (!process.env.CUDI_SYNC_SECRET) return { error: "integration disabled" };
  const now = new Date();
  const shifts = await prisma.shift.findMany({
    where: { sourceSystem: CUDI_SHIFT_SOURCE, startTime: { gte: now } },
    select: {
      sourceId: true,
      participants: {
        select: {
          user: { select: { rNumber: true, email: true, firstName: true, lastName: true, name: true } },
        },
      },
    },
  });

  const payloadShifts = shifts
    .filter((shift): shift is typeof shift & { sourceId: string } => shift.sourceId != null)
    .map((shift) => ({
      sourceId: shift.sourceId,
      registrants: shift.participants.map((participant) => ({
        rNumber: participant.user.rNumber,
        email: participant.user.email,
        firstName: participant.user.firstName,
        lastName: participant.user.lastName,
        name: participant.user.name,
      })),
    }));

  const result = await postToCudi({ action: "reconcile", shifts: payloadShifts });
  return result.ok ? { shifts: payloadShifts.length } : { error: result.error ?? `cudi ${result.status}` };
}
