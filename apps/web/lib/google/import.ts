import "server-only";

import { prisma } from "@vtk/db";
import { logAudit } from "@/lib/audit";
import type { GoogleConfig } from "./config";
import { getGroup, getGroupSettings, listMembers } from "./client";
import { normaliseEmail } from "./members";

/**
 * Een bestaande Google-groep overnemen: vanaf dan beheert de site haar.
 *
 * **Overnemen verandert niets in Google.** De leden die er nu als gewoon lid in
 * staan, komen mee als losse leden: een lid van de site wanneer het adres zijn
 * gekoppelde account is, anders een vrij adres (een andere groep, een extern
 * adres). De eerste sync na het overnemen vindt dus exact wat er al stond. Pas
 * wie daarna een bron toevoegt (de post, de POC), kan de overgenomen adressen
 * wissen; zie `clearImportedExtrasAction`.
 *
 * Eigenaars en beheerders van de groep komen niet mee: de sync raakt die nooit
 * aan, dus ze blijven gewoon staan.
 */

/** De notitie op een los adres dat bij het overnemen meekwam. */
export const IMPORTED_NOTE = "overgenomen uit Google";

export type ImportOutcome = { email: string; ok: boolean; members: number; error?: string };

export async function importGoogleGroup(cfg: GoogleConfig, rawEmail: string): Promise<ImportOutcome> {
  const email = normaliseEmail(rawEmail);
  try {
    const existing = await prisma.mailGroup.findUnique({ where: { email }, select: { id: true } });
    if (existing) return { email, ok: false, members: 0, error: "staat al in de site" };

    const group = await getGroup(cfg, email);
    if (!group) return { email, ok: false, members: 0, error: "bestaat niet in Google" };

    const [members, settings] = await Promise.all([
      listMembers(cfg, group.id),
      getGroupSettings(cfg, group.email),
    ]);
    const plain = members.filter((m) => m.role === "MEMBER");

    // Een lid van de site herkennen we enkel op zijn gekoppelde account, nooit
    // op naam: zie docs/design-decisions.md, "Identiteit".
    const users = await prisma.user.findMany({
      where: { googleEmail: { in: plain.map((m) => normaliseEmail(m.email)) }, deletedAt: null },
      select: { id: true, googleEmail: true },
    });
    const userByEmail = new Map(users.map((u) => [u.googleEmail as string, u.id]));

    const created = await prisma.mailGroup.create({
      data: {
        email: normaliseEmail(group.email),
        name: group.name || email,
        description: group.description || null,
        googleId: group.id,
        importedAt: new Date(),
        // Wie mag posten nemen we over zoals het stond: een lijst die enkel
        // intern bereikbaar was, wordt dat niet ongevraagd voor iedereen.
        allowExternalSenders: (settings?.whoCanPostMessage ?? "ANYONE_CAN_POST") === "ANYONE_CAN_POST",
        lastMemberCount: plain.length,
        extras: {
          create: plain.map((m) => {
            const address = normaliseEmail(m.email);
            const userId = userByEmail.get(address);
            return userId
              ? { userId, note: IMPORTED_NOTE }
              : { email: address, note: IMPORTED_NOTE };
          }),
        },
      },
      select: { id: true },
    });

    await logAudit({
      action: "create",
      entity: "mailGroup",
      entityId: created.id,
      target: email,
      summary: `overgenomen uit Google met ${plain.length} leden`,
    });
    return { email, ok: true, members: plain.length };
  } catch (err) {
    return { email, ok: false, members: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
