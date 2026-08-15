import { prisma } from "@vtk/db";
import { cardDisplayName, resolveStudentCard } from "@/lib/student-card";
import { isFakscannerRequest, logFakScan, registerCheckin } from "@/lib/fakscanner-server";
import { rewardProgress } from "@/lib/fakscanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Check-in aan de bar. De Raspberry Pi met de kaartlezer POST't de ruwe scan
 * (`serial;cardAppId`) met `Authorization: Bearer $FAKSCANNER_TOKEN`; wij zoeken
 * het r-nummer op (eigen kaarttabel, anders KU Leuven), tellen één check-in per
 * bardag en zeggen terug hoeveel punten er staan en of er een pint bij hoort.
 *
 * **Een VTK-account is niet nodig.** De stand hangt aan het r-nummer, dus wie geen
 * lid is spaart gewoon mee. Het account dient enkel om er een naam bij te kunnen
 * tonen; ontbreekt het, dan valt dat terug op de naam van de kaart.
 *
 * Enkel **mislukte** scans gaan naar `FakScanLog`; een log van elke geslaagde
 * check-in zou een aanwezigheidslijst zijn (zie docs/design-decisions.md).
 *
 * Antwoord (200): `{ ok, counted, rNumber, name, total, points, double, freeBeer,
 * toNextBeer, message }`. Bij een fout: `{ ok: false, error }` met een korte,
 * tonbare zin; het schermpje op de Pi is twee regels van zestien tekens breed.
 */

/** Kort genoeg voor het schermpje aan de bar. */
const MESSAGES = {
  noCard: "Geen kaart gelezen",
  unreadable: "Kaart niet gelezen",
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
    // Ongeldige scan of KU Leuven onbereikbaar: we weten niet eens van wie de
    // kaart was, dus de reden gaat naar de log en niet naar de bar.
    await logFakScan({ result: "CARD_ERROR", reason: resolved.error });
    return Response.json({ ok: false, error: MESSAGES.unreadable });
  }

  const rNumber = resolved.rNumber;

  // Enkel om een naam te kunnen tonen; wie geen account heeft, telt gewoon mee.
  const user = await prisma.user
    .findUnique({ where: { rNumber }, select: { name: true } })
    .catch(() => null);
  const name = user?.name ?? cardDisplayName(resolved);

  let outcome;
  try {
    outcome = await registerCheckin(rNumber);
  } catch (err) {
    console.error("[fakscanner] check-in mislukt:", err);
    await logFakScan({
      result: "SERVER_ERROR",
      rNumber,
      reason: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: false, rNumber, name, error: MESSAGES.serverError });
  }

  const { toNext } = rewardProgress(outcome.config, outcome.total);
  return Response.json({
    ok: true,
    counted: outcome.counted,
    rNumber,
    name,
    total: outcome.total,
    points: outcome.points,
    double: outcome.double,
    freeBeer: outcome.reward,
    /** Hoeveel punten nog tot de volgende pint; de Pi mag dit tonen. */
    toNextBeer: toNext,
    message: outcome.counted ? null : MESSAGES.alreadyToday,
  });
}
