"use server";

import { redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import { requireSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";

/**
 * "Ik heb nog geen VTK-account": zet de koppelgate een week stil.
 *
 * Bewust een echte kolom en geen cookie: het is ook informatie voor IT (wie
 * wacht er op een account?), en een cookie zou de gate op elke nieuwe browser
 * opnieuw laten toeslaan bij iemand die er niets aan kan doen.
 */
export async function deferGoogleLinkAction(home: string): Promise<void> {
  const session = await requireSession();

  await prisma.user.update({
    where: { id: session.user.id },
    data: { googleLinkDeferredAt: new Date() },
  });
  await logAudit({
    action: "update",
    entity: "user",
    entityId: session.user.id,
    target: session.user.name,
    summary: "koppeling met het VTK-account uitgesteld (nog geen account)",
  });

  // `redirect` werkt via een throw: hou hem buiten elke try/catch.
  redirect(home.startsWith("/") ? home : "/");
}
