"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@vtk/db";
import { readDiscordLinkToken } from "@/lib/discord/linkToken";
import { removeDiscordRoles, syncDiscordRolesForUser } from "@/lib/discord/pocAccess";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { requireSession } from "@/lib/session";

/** Koppelt het Discord-account uit de link aan wie nu aangemeld is. */
export async function linkDiscordAccountAction(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireSession();
  const token = formData.get("token");
  const link = typeof token === "string" ? readDiscordLinkToken(token) : null;
  if (!link) return saveError("DISCORD_LINK_EXPIRED");

  const [taken, current] = await Promise.all([
    prisma.user.findUnique({ where: { discordId: link.discordId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { discordId: true, discordRoleIds: true } }),
  ]);
  if (taken && taken.id !== session.user.id) return saveError("DISCORD_TAKEN");

  // Wisselt iemand van Discord-account, dan gaan de rollen niet mee naar twee accounts.
  const previous = current?.discordId && current.discordId !== link.discordId ? current : null;

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      discordId: link.discordId,
      discordUsername: link.username || null,
      ...(previous ? { discordRoleIds: { set: [] } } : {}),
    },
  });
  after(async () => {
    if (previous?.discordId) await removeDiscordRoles(previous.discordId, previous.discordRoleIds);
    await syncDiscordRolesForUser(session.user.id);
  });
  revalidatePath("/[locale]/account", "page");
  return saveOk();
}

export async function unlinkDiscordAccountAction(): Promise<SaveState> {
  const session = await requireSession();
  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { discordId: true, discordRoleIds: true },
  });
  await prisma.user.update({
    where: { id: session.user.id },
    data: { discordId: null, discordUsername: null, discordRoleIds: { set: [] } },
  });
  if (current?.discordId) {
    const { discordId, discordRoleIds } = current;
    after(() => removeDiscordRoles(discordId, discordRoleIds));
  }
  revalidatePath("/[locale]/account", "page");
  return saveOk();
}
