import { prisma } from "@vtk/db";
import { verifyStudentCard } from "@/lib/kul-card";
import { getDoorConfig, isDoorDeviceRequest } from "@/lib/door-config";
import { logDoorAccess, userMayOpenDoor } from "@/lib/door-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fysieke kaartscan aan de deur. De Raspberry Pi POST't de ruwe scan
 * (`serial;cardAppId`) met het device-secret als Bearer; wij verifiëren de kaart
 * bij KU Leuven, zoeken de gebruiker op via het r-nummer, beslissen allow/deny en
 * loggen elke uitkomst. De Pi opent zelf de GPIO-lock wanneer `allowed` true is.
 *
 * Respons: `{ allowed, person?, reason?, unlockSeconds }`.
 */
export async function POST(request: Request) {
  if (!(await isDoorDeviceRequest(request))) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const cfg = await getDoorConfig();
  const unlockSeconds = cfg.unlockSeconds;

  let card = "";
  try {
    const body = (await request.json()) as { card?: unknown };
    card = typeof body.card === "string" ? body.card : "";
  } catch {
    /* lege/ongeldige body -> card blijft leeg */
  }
  if (!card.trim()) {
    return Response.json({ allowed: false, reason: "no_card", unlockSeconds }, { status: 400 });
  }

  const verified = await verifyStudentCard(card);
  if (!verified.ok) {
    // Ongeldige scan of KU Leuven onbereikbaar: geen persoon om aan te koppelen.
    await logDoorAccess({ method: "CARD", result: "ERROR", reason: verified.error });
    return Response.json({ allowed: false, reason: "verify_failed", unlockSeconds });
  }

  const rNumber = verified.rNumber.trim().toLowerCase();
  const cardName = [verified.firstName, verified.lastName].filter(Boolean).join(" ") || null;

  const user = await prisma.user.findUnique({
    where: { rNumber },
    select: { id: true, name: true },
  });
  if (!user) {
    await logDoorAccess({ method: "CARD", result: "UNKNOWN_CARD", rNumber, cardName, reason: "no_user" });
    return Response.json({ allowed: false, reason: "unknown_card", person: cardName, unlockSeconds });
  }

  const allowed = await userMayOpenDoor(user.id);
  await logDoorAccess({
    method: "CARD",
    result: allowed ? "ALLOWED" : "DENIED",
    userId: user.id,
    rNumber,
    cardName,
    reason: allowed ? null : "no_access",
  });

  return Response.json({ allowed, person: user.name, unlockSeconds });
}
