import { prisma } from "@vtk/db";
import { cardDisplayName, resolveStudentCard } from "@/lib/student-card";
import {
  isFakscannerRequest,
  logFakScan,
  registerCheckin,
} from "@/lib/fakscanner-server";
import { rewardProgress } from "@/lib/fakscanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Check-in aan de bar. De Raspberry Pi met de kaartlezer POST't de ruwe scan
 * (`serial;cardAppId`) met `Authorization: Bearer $FAKSCANNER_TOKEN`; wij zoeken
 * het r-nummer op (eigen kaarttabel, anders KU Leuven), tellen één check-in per
 * bardag en zeggen terug hoeveel punten het lid staat en of er een pint bij hoort.
 *
 * Elke uitkomst gaat naar `FakScanLog`, ook de mislukte, zodat /admin/fakscanner
 * toont wanneer de lezer of KU Leuven het liet afweten.
 *
 * Antwoord (200): `{ ok, counted, rNumber, name, total, points, double, freeBeer,
 * message }`. Bij een fout: `{ ok: false, error }` met een korte, tonbare zin;
 * het schermpje op de Pi is twee regels van zestien tekens breed.
 */

/** Kort genoeg voor het schermpje aan de bar. */
const MESSAGES = {
  noCard: "Geen kaart gelezen",
  unreadable: "Kaart niet gelezen",
  unknownUser: "Geen VTK-account",
  alreadyToday: "Al ingecheckt",
  serverError: "Serverfout",
} as const;

export async function POST(request: Request) {
  if (!isFakscannerRequest(request)) {
    return Response.json({ ok: false, error: "Geen toegang" }, { status: 401 });
  }

  let card = "";
  try {
    const body = (await request.json()) as { card?: unknown };
    card = typeof body.card === "string" ? body.card : "";
  } catch {
    /* lege/ongeldige body -> card blijft leeg */
  }
  if (!card.trim()) {
    return Response.json({ ok: false, error: MESSAGES.noCard }, { status: 400 });
  }

  const resolved = await resolveStudentCard(card);
  if (!resolved.ok) {
    // Ongeldige scan of KU Leuven onbereikbaar: er is geen persoon om aan te
    // koppelen, dus de reden gaat mee naar de log en niet naar de bar.
    await logFakScan({ result: "ERROR", reason: resolved.error });
    return Response.json({ ok: false, error: MESSAGES.unreadable });
  }

  const rNumber = resolved.rNumber;
  const cardName = cardDisplayName(resolved);

  const user = await prisma.user.findUnique({
    where: { rNumber },
    select: { id: true, name: true, active: true },
  });
  if (!user || !user.active) {
    await logFakScan({
      result: "UNKNOWN_CARD",
      rNumber,
      cardName,
      reason: user ? "inactive_user" : "no_user",
    });
    return Response.json({ ok: false, rNumber, name: cardName, error: MESSAGES.unknownUser });
  }

  let outcome;
  try {
    outcome = await registerCheckin(user.id);
  } catch (err) {
    console.error("[fakscanner] check-in mislukt:", err);
    await logFakScan({
      result: "ERROR",
      userId: user.id,
      rNumber,
      cardName,
      reason: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: false, rNumber, name: user.name, error: MESSAGES.serverError });
  }

  const { toNext } = rewardProgress(outcome.config, outcome.total);
  await logFakScan({
    result: outcome.counted ? "COUNTED" : "ALREADY_TODAY",
    userId: user.id,
    rNumber,
    cardName,
    points: outcome.counted ? outcome.points : null,
    total: outcome.total,
    reward: outcome.reward,
  });

  return Response.json({
    ok: true,
    counted: outcome.counted,
    rNumber,
    name: user.name,
    total: outcome.total,
    points: outcome.points,
    double: outcome.double,
    freeBeer: outcome.reward,
    /** Hoeveel punten nog tot de volgende pint; de Pi mag dit tonen. */
    toNextBeer: toNext,
    message: outcome.counted ? null : MESSAGES.alreadyToday,
  });
}
