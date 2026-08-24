"use server";

import { prisma } from "@vtk/db";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { requirePermission } from "@/lib/session";
import { sendPushToUsers } from "@/lib/app-api/push";

/**
 * Met de hand een pushbericht sturen.
 *
 * Bewust smal gehouden. Er is één doelgroep die je kan kiezen: iedereen met de
 * app, of de leden van één post. Geen vrije selectie, geen segmenten. Een
 * pushbericht is niet terug te nemen, en hoe fijner de knoppen, hoe makkelijker
 * je er de verkeerde indrukt.
 *
 * Alles wordt gelogd met de tekst erbij. Achteraf moeten kunnen zien wie wat naar
 * wiens telefoon stuurde, is bij een onomkeerbare actie het minimum.
 */

const schema = z.object({
  title: z.string().trim().min(3).max(80),
  body: z.string().trim().min(3).max(240),
  /** Leeg = iedereen met de app; anders de code van een post of werkgroep. */
  groupCode: z.string().trim().max(32).optional(),
  /** Waar de app heen springt bij een tik. Een pad in de app. */
  path: z.string().trim().max(120).optional(),
});

/** Enkel een pad binnen de app; een volledige URL zou een open deur zijn. */
function safePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^\/[A-Za-z0-9\-_/]*$/.test(value) ? value : undefined;
}

export async function sendAppPushAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("app.push");

  const parsed = schema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    groupCode: formData.get("groupCode") || undefined,
    path: formData.get("path") || undefined,
  });
  if (!parsed.success) return saveError("INVALID_MESSAGE");

  const { title, body, groupCode } = parsed.data;
  const path = safePath(parsed.data.path);

  // De ontvangers: iedereen met een geregistreerd toestel, of enkel de leden van
  // één groep. We vertrekken van de toestellen en niet van de ledenlijst, want
  // iemand zonder app hoeft hier niet in de telling te zitten.
  const devices = await prisma.appPushDevice.findMany({
    where: groupCode
      ? { user: { memberships: { some: { group: { code: groupCode } } } } }
      : {},
    select: { userId: true },
    distinct: ["userId"],
  });

  if (devices.length === 0) return saveError("NO_RECIPIENTS");

  const outcome = await sendPushToUsers(
    devices.map((device) => device.userId),
    { title, body, path },
  );

  await logAudit({
    action: "send",
    entity: "appPush",
    target: groupCode ?? "iedereen",
    summary: `${session.user.name} stuurde een pushbericht naar ${outcome.sent} toestel(len): "${title}"`,
  });

  if (outcome.sent === 0) return saveError("SEND_FAILED");
  return saveOk();
}
