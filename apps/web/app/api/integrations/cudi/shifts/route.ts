import * as Sentry from "@sentry/nextjs";
import { prisma } from "@vtk/db";
import { logAudit } from "@/lib/audit";
import {
  CUDI_SHIFT_SOURCE,
  mapCudiShift,
  parseCudiShiftSync,
} from "@/lib/cudiShiftMirror";

export const runtime = "nodejs";

/**
 * Hoeveel verwijderde shiften we bij naam noemen in de logboekregel. `logAudit`
 * kapt een samenvatting sowieso af op 500 tekens; dit houdt de regel leesbaar en
 * zorgt dat het aantal er nog achter past.
 */
const PRUNE_LOG_LIMIT = 12;

/** Onderwerp van de logboekregels; zo staan ze samen onder één noemer. */
const AUDIT_TARGET = "Cursusdienst-shiften (cudi)";

/**
 * Schrijft een regel in het **adminlogboek** (/admin/it/logboek). Dat is de enige
 * plek waar dit soort gebeurtenissen te lezen valt: de containerlog is enkel via
 * de server te bereiken en wordt nergens verzameld, dus wat daar in staat, ziet
 * niemand.
 *
 * Er komt een regel bij wat een beheerder moet opmerken: een sync die shiften
 * weghaalde, en een sync die niet doorging. Een geslaagde routine-sync niet: cudi
 * stuurt de volledige set bij élke wijziging aan zijn kant, dus één reeks
 * gegenereerde shiften levert al tientallen syncs op en die zouden het logboek
 * verzuipen.
 *
 * Een geweigerd token staat er ook niet in: het endpoint is onbeschermd
 * bereikbaar, dus wie het adres kent zou het logboek kunnen volspammen. De
 * aanroeper krijgt zijn 401 en ziet dat aan zijn eigen kant.
 *
 * `logAudit` vangt zijn eigen fouten op, dus dit kan de sync niet doen mislukken.
 * De actor wordt "Systeem": er is geen sessie, dit is een andere server.
 */
function audit(summary: string) {
  return logAudit({ action: "sync", entity: "shift", target: AUDIT_TARGET, summary });
}

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
    await audit("sync geweigerd: de body was geen geldige JSON");
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = parseCudiShiftSync(body);
  if (!parsed.ok) {
    // De reden gaat ook mee in het antwoord: cudi logt zijn eigen kant en heeft
    // er niets aan dat wij als enige weten welk veld niet klopte.
    await audit(`sync geweigerd, cudi stuurde een ongeldige set: ${parsed.reason}`);
    return Response.json({ error: "INVALID_BODY", reason: parsed.reason }, { status: 400 });
  }

  const { cutoff, shifts } = parsed.body;
  const sourceIds = shifts.map((shift) => shift.sourceId);

  // Een lege set betekent "cudi heeft geen enkele komende shift meer" en prunet
  // dus alles wat er staat. Dat is geldig (ze kunnen echt allemaal weg zijn), maar
  // het is ook precies hoe een half mislukte generatie aan de andere kant eruitziet.
  let result: { upserted: number; pruned: number; prunedIds: string[] };
  try {
    result = await prisma.$transaction(async (tx) => {
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
      const where = {
        sourceSystem: CUDI_SHIFT_SOURCE,
        startTime: { gte: cutoff },
        ...(sourceIds.length > 0 ? { sourceId: { notIn: sourceIds } } : {}),
      };

      // Eerst opvragen wélke, dan pas verwijderen: `deleteMany` geeft enkel een
      // aantal terug, en "er zijn er zeven weg" is niet genoeg om ze terug te
      // zetten als cudi een halve set stuurde. Zo staat in de log wat er stond.
      const doomed = await tx.shift.findMany({
        where,
        select: { sourceId: true, name: true, startTime: true },
        orderBy: { startTime: "asc" },
      });
      const deleted = await tx.shift.deleteMany({ where });

      return {
        upserted: shifts.length,
        pruned: deleted.count,
        prunedIds: doomed.map((row) => `${row.sourceId}@${row.startTime.toISOString()}`),
      };
    });
  } catch (err) {
    // De transactie draait alles terug, dus na deze regel is er niets veranderd.
    // De stacktrace hoort in Sentry; het logboek krijgt de leesbare versie.
    console.error("[cudi-shifts] sync mislukt:", err);
    Sentry.captureException(err, { tags: { integration: "cudi-shifts" } });
    await audit(`sync mislukt na ${shifts.length} ontvangen shift(en); er is niets gewijzigd`);
    return Response.json({ error: "SYNC_FAILED" }, { status: 500 });
  }

  // Enkel wanneer er echt iets weg is. De identiteiten staan erbij: "er zijn er
  // zeven weg" is niet genoeg om ze terug te zetten wanneer cudi een halve set
  // stuurde, en dit is de enige plek waar dat na te lezen valt.
  if (result.pruned > 0) {
    const named = result.prunedIds.slice(0, PRUNE_LOG_LIMIT).join(", ");
    const rest = result.pruned > PRUNE_LOG_LIMIT ? ` (+${result.pruned - PRUNE_LOG_LIMIT} meer)` : "";
    await audit(
      `${result.pruned} gespiegelde shift(en) verwijderd omdat cudi ze niet meer stuurt, ` +
        `${result.upserted} bijgewerkt: ${named}${rest}`,
    );
  }

  return Response.json({ upserted: result.upserted, pruned: result.pruned });
}
