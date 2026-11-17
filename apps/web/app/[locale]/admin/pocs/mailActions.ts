"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { type SaveState, saveError, saveOk } from "@/lib/saveState";
import { normaliseEmail } from "@/lib/google/members";
import { pushMailGroupsForPoc } from "@/lib/google/sync";

/**
 * De groepsadressen van de POC's (ene-poc@vtk.be).
 *
 * Een POC-lijst volgt de vertegenwoordigers van één werkingsjaar
 * (`Poc.mailYear`), en dat jaar verschuift enkel met de knop "verkozen". Wie je
 * vooraf voor volgend jaar invoert, komt pas in de lijst wanneer de verkiezing
 * achter de rug is. Zie docs/design-decisions.md, "POC-lijsten".
 */

/**
 * Maakt voor elke POC met een adres een groepsadres met die POC als bron, of
 * zet de POC als bron op het adres als het er al is (bv. overgenomen uit
 * Google). Twee keer drukken breekt niets.
 */
export async function createPocListsAction(): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const pocs = await prisma.poc.findMany({
    where: { email: { not: null } },
    select: { id: true, nameNl: true, email: true },
  });

  let created = 0;
  let linked = 0;
  for (const poc of pocs) {
    const email = normaliseEmail(poc.email ?? "");
    if (!email.includes("@")) continue;
    const existing = await prisma.mailGroup.findUnique({
      where: { email },
      select: { id: true, sources: { where: { pocId: poc.id }, select: { id: true } } },
    });
    if (existing) {
      if (existing.sources.length === 0) {
        await prisma.mailGroupSource.create({ data: { mailGroupId: existing.id, pocId: poc.id } });
        linked += 1;
      }
      continue;
    }
    await prisma.mailGroup.create({
      data: {
        email,
        name: `POC ${poc.nameNl}`,
        description: `De verkozen vertegenwoordigers van POC ${poc.nameNl}.`,
        sources: { create: [{ pocId: poc.id }] },
      },
    });
    created += 1;
  }

  await logAudit({
    action: "create",
    entity: "mailGroup",
    target: "POC's",
    summary: `${created} POC-adressen aangemaakt, ${linked} bestaande gekoppeld`,
  });
  revalidatePath("/[locale]/admin/pocs", "layout");
  revalidatePath("/admin/groepsadressen");
  for (const poc of pocs) after(() => pushMailGroupsForPoc(poc.id));
  return saveOk();
}

/**
 * "De vertegenwoordigers van dit jaar zijn verkozen": de lijst van één POC, of
 * van elke POC met vertegenwoordigers in dat jaar, gaat naar dat jaar.
 */
export async function markPocsElectedAction(formData: FormData): Promise<SaveState> {
  await requirePermission("pocs.manage");
  const year = Number(formData.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return saveError("INVALID_INPUT");
  const pocId = String(formData.get("pocId") ?? "") || null;

  const pocs = await prisma.poc.findMany({
    where: pocId ? { id: pocId } : { representatives: { some: { year } } },
    select: { id: true, nameNl: true },
  });
  if (pocs.length === 0) return saveError("NO_REPRESENTATIVES");

  await prisma.poc.updateMany({ where: { id: { in: pocs.map((p) => p.id) } }, data: { mailYear: year } });
  await logAudit({
    action: "update",
    entity: "poc",
    entityId: pocId,
    target: pocId ? pocs[0].nameNl : "POC's",
    summary: `verkozen: groepsadres volgt de vertegenwoordigers van ${year}-${year + 1}${pocId ? "" : ` (${pocs.length} POC's)`}`,
  });
  revalidatePath("/[locale]/admin/pocs", "layout");
  revalidatePath("/admin/groepsadressen");
  for (const poc of pocs) after(() => pushMailGroupsForPoc(poc.id));
  return saveOk();
}
