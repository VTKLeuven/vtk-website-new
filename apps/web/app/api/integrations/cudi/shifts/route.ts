import { prisma } from "@vtk/db";
import {
  CUDI_SHIFT_SOURCE,
  mapCudiShift,
  parseCudiShiftSyncBody,
} from "@/lib/cudiShiftMirror";

export const runtime = "nodejs";

/**
 * Spiegel-endpoint voor cursusdienst-shiften van cudi.vtk.be. Cudi stuurt bij
 * elke shift-wijziging de volledige set komende shiften; wij upserten die als
 * native `Shift`-rijen (herkomst = "cudi") en prunen de gespiegelde toekomstige
 * shiften die cudi niet meer stuurt. Voorbije gespiegelde shiften blijven staan
 * voor ranking/reward/history.
 *
 * Auth: gedeeld `Bearer`-secret (`CUDI_SYNC_SECRET`), server-to-server. Zie
 * docs/design-decisions.md, "Cursusdienst-shiften op de main site".
 */
export async function POST(request: Request) {
  const secret = process.env.CUDI_SYNC_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = parseCudiShiftSyncBody(body);
  if (!parsed) {
    return Response.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const { cutoff, shifts } = parsed;
  const sourceIds = shifts.map((shift) => shift.sourceId);

  const result = await prisma.$transaction(async (tx) => {
    for (const shift of shifts) {
      const data = mapCudiShift(shift);
      await tx.shift.upsert({
        where: {
          sourceSystem_sourceId: { sourceSystem: CUDI_SHIFT_SOURCE, sourceId: shift.sourceId },
        },
        create: data,
        update: data,
      });
    }

    // Prune toekomstige gespiegelde shiften die cudi niet meer stuurt (verwijderd
    // op cudi). Enkel toekomst (>= cutoff); voorbije shiften blijven behouden.
    // NB Fase 3: zodra leden zich hier inschrijven, moet een prune met
    // deelnemers eerst waarschuwen i.p.v. de `ShiftParticipant` stil te cascaden.
    const pruned = await tx.shift.deleteMany({
      where: {
        sourceSystem: CUDI_SHIFT_SOURCE,
        startTime: { gte: cutoff },
        ...(sourceIds.length > 0 ? { sourceId: { notIn: sourceIds } } : {}),
      },
    });

    return { upserted: shifts.length, pruned: pruned.count };
  });

  return Response.json(result);
}
