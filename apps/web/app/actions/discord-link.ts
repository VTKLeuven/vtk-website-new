"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { readDiscordLinkToken } from "@/lib/discord/linkToken";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { requireSession } from "@/lib/session";

/** Koppelt het Discord-account uit de link aan wie nu aangemeld is. */
export async function linkDiscordAccountAction(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireSession();
  const token = formData.get("token");
  const link = typeof token === "string" ? readDiscordLinkToken(token) : null;
  if (!link) return saveError("DISCORD_LINK_EXPIRED");

  const taken = await prisma.user.findUnique({ where: { discordId: link.discordId }, select: { id: true } });
  if (taken && taken.id !== session.user.id) return saveError("DISCORD_TAKEN");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { discordId: link.discordId, discordUsername: link.username || null },
  });
  revalidatePath("/[locale]/account", "page");
  return saveOk();
}

export async function unlinkDiscordAccountAction(): Promise<SaveState> {
  const session = await requireSession();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { discordId: null, discordUsername: null },
  });
  revalidatePath("/[locale]/account", "page");
  return saveOk();
}
