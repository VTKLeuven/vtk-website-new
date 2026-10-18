"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import { requireSession } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { logAudit } from "@/lib/audit";
import { fetchDiscordWebhookInfo } from "@/lib/discord/client";
import { postEventToWebhook, sendDiscordTest } from "@/lib/discord/posts";
import { parseDiscordWebhookUrl } from "@/lib/discord/webhookUrl";

/**
 * Het beheer van de Discord-webhooks op /admin/kalender/discord.
 *
 * Voor wie alle evenementen beheert, zoals de categorieën: een webhook post
 * elk evenement van elke post, en zijn URL is een geheim waarmee je onder de
 * naam van de kring in een kanaal schrijft.
 */
async function requireDiscordManager() {
  const session = await requireSession();
  if (!session.user.isSuperAdmin && !hasPermission(session, "calendar.manageAll")) {
    throw new Error("forbidden");
  }
  return session;
}

function revalidateDiscord() {
  revalidatePath("/admin/kalender/discord");
  revalidatePath("/en/admin/kalender/discord");
}

const webhookSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  url: z.string().trim().optional(),
});

/**
 * Een webhook toevoegen, of de naam en de URL van een bestaande wijzigen.
 *
 * De URL gaat eerst langs Discord: een getypte of half gekopieerde URL hoort
 * hier een rode toast te geven, niet pas bij het eerste evenement dat niet
 * aankomt. Dat levert meteen de naam en het kanaal op voor het beheer.
 * Een leeg URL-veld bij een bestaande webhook laat de URL staan: het beheer
 * toont ze nooit, dus ze kan er ook niet staan om opnieuw mee te sturen.
 */
export async function saveDiscordWebhookAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireDiscordManager();
  const parsed = webhookSchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    name: formData.get("name"),
    url: (formData.get("url") as string) || undefined,
  });
  if (!parsed.success) return saveError("INVALID_INPUT");
  const { id, name, url: rawUrl } = parsed.data;

  if (!id && !rawUrl) return saveError("INVALID_WEBHOOK_URL");
  let discord: { url: string; name: string | null; channelId: string | null; guildId: string | null } | null =
    null;
  if (rawUrl) {
    const webhookUrl = parseDiscordWebhookUrl(rawUrl);
    if (!webhookUrl) return saveError("INVALID_WEBHOOK_URL");
    const info = await fetchDiscordWebhookInfo(webhookUrl.url);
    if (!info.ok) {
      return info.status === null
        ? saveError("DISCORD_UNREACHABLE", info.message)
        : saveError("WEBHOOK_NOT_FOUND", info.message);
    }
    discord = { url: webhookUrl.url, name: info.name, channelId: info.channelId, guildId: info.guildId };
  }

  const discordFields = discord
    ? {
        url: discord.url,
        discordName: discord.name,
        channelId: discord.channelId,
        guildId: discord.guildId,
        lastError: null,
        lastErrorAt: null,
      }
    : {};

  try {
    if (id) {
      await prisma.discordWebhook.update({ where: { id }, data: { name, ...discordFields } });
      await logAudit({
        action: "update",
        entity: "discordWebhook",
        entityId: id,
        target: name,
        summary: discord ? "naam en URL gewijzigd" : "naam gewijzigd",
      });
    } else {
      const created = await prisma.discordWebhook.create({
        data: { name, ...discordFields, url: discord!.url, autoSince: new Date() },
        select: { id: true },
      });
      await logAudit({
        action: "create",
        entity: "discordWebhook",
        entityId: created.id,
        target: name,
      });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return saveError("WEBHOOK_EXISTS");
    }
    throw error;
  }

  revalidateDiscord();
  return saveOk();
}

/**
 * Vanzelf posten aan of uit. Weer aanzetten verschuift `autoSince` naar nu: wat
 * er gepubliceerd werd terwijl hij uit stond, komt niet alsnog in één klap in
 * het kanaal. Dat kan met de hand.
 */
export async function setDiscordWebhookEnabledAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireDiscordManager();
  const id = String(formData.get("id") ?? "");
  const enabled = formData.get("enabled") === "true";
  const webhook = await prisma.discordWebhook.findUnique({ where: { id }, select: { name: true, enabled: true } });
  if (!webhook) return saveError("INVALID_INPUT");
  if (webhook.enabled !== enabled) {
    await prisma.discordWebhook.update({
      where: { id },
      data: enabled ? { enabled, autoSince: new Date() } : { enabled },
    });
    await logAudit({
      action: "update",
      entity: "discordWebhook",
      entityId: id,
      target: webhook.name,
      summary: enabled ? "vanzelf posten aangezet" : "vanzelf posten uitgezet",
    });
  }
  revalidateDiscord();
  return saveOk();
}

/** Verwijdert de webhook en zijn klikcijfers; de berichten in Discord blijven staan. */
export async function deleteDiscordWebhookAction(formData: FormData): Promise<SaveState> {
  await requireDiscordManager();
  const id = String(formData.get("id") ?? "");
  const webhook = await prisma.discordWebhook.findUnique({ where: { id }, select: { name: true } });
  if (!webhook) return saveError("INVALID_INPUT");
  await prisma.discordWebhook.delete({ where: { id } });
  await logAudit({ action: "delete", entity: "discordWebhook", entityId: id, target: webhook.name });
  revalidateDiscord();
  return saveOk();
}

/** Een testbericht, met het eerstvolgende evenement als voorbeeld. */
export async function testDiscordWebhookAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireDiscordManager();
  const id = String(formData.get("id") ?? "");
  const webhook = await prisma.discordWebhook.findUnique({ where: { id }, select: { id: true } });
  if (!webhook) return saveError("INVALID_INPUT");
  const result = await sendDiscordTest(webhook.id);
  revalidateDiscord();
  return result.ok ? saveOk() : saveError("DISCORD_REJECTED", result.message);
}

/** Eén evenement met de hand in een kanaal posten. */
export async function postEventToDiscordAction(formData: FormData): Promise<SaveState> {
  await requireDiscordManager();
  const webhookId = String(formData.get("webhookId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  const outcome = await postEventToWebhook({ webhookId, eventId, trigger: "MANUAL" });
  revalidateDiscord();

  if (outcome.kind === "sent") {
    const [webhook, event] = await Promise.all([
      prisma.discordWebhook.findUnique({ where: { id: webhookId }, select: { name: true } }),
      prisma.calendarEvent.findUnique({ where: { id: eventId }, select: { titleNl: true } }),
    ]);
    await logAudit({
      action: "send",
      entity: "discordWebhook",
      entityId: webhookId,
      target: webhook?.name ?? webhookId,
      summary: `"${event?.titleNl ?? eventId}" met de hand gepost`,
    });
    return saveOk();
  }
  if (outcome.kind === "failed") return saveError("DISCORD_REJECTED", outcome.message);
  switch (outcome.reason) {
    case "already-sent":
      return saveError("ALREADY_POSTED");
    case "busy":
      return saveError("POST_IN_PROGRESS");
    case "not-published":
      return saveError("NOT_PUBLISHED");
    default:
      return saveError("INVALID_INPUT");
  }
}
