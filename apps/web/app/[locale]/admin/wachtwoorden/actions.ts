"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { requireAnyPermission, requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { type SaveAction, type SaveState, saveError, saveOk } from "@/lib/saveState";
import { isEditableDestination } from "@/lib/href";
import { getVaultConfig } from "@/lib/vault/config";
import { requireVaultPost } from "@/lib/vault/access";
import {
  createVaultItem,
  deleteVaultItem,
  revealVaultItem,
  updateVaultItem,
} from "@/lib/vault/items";
import { reconcileVault } from "@/lib/vault/sync";

/**
 * Server actions van de wachtwoordkluis.
 *
 * Twee dingen die in elke action terugkomen:
 *
 * - **De post komt nooit uit het formulier.** `requireVaultPost` zoekt hem op
 *   voor deze sessie; een `collectionId` dat de client meestuurt, negeren we.
 *   Anders volstaat één gewijzigd hidden field om in de kluis van een andere
 *   post te schrijven.
 * - **Verwachte fouten komen terug, ze worden niet gegooid** (zie CLAUDE.md).
 *   Een onbereikbare kluis is verwacht; die hoort een rode toast te geven en
 *   geen error boundary.
 */

const itemSchema = z.object({
  vaultPostId: z.string().min(1),
  itemId: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  username: z.string().trim().max(200).optional(),
  password: z.string().max(2000).optional(),
  uri: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
});

function fields(formData: FormData) {
  return Object.fromEntries(formData.entries()) as Record<string, string>;
}

/** Vertaalt een uitzondering uit de kluislaag naar een foutcode voor de toast. */
function toCode(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message === "FORBIDDEN") return "FORBIDDEN";
  if (message === "NOT_SYNCED") return "NOT_SYNCED";
  return "VAULT_UNREACHABLE";
}

export async function saveVaultItemAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireAnyPermission(["vault.editOwn", "vault.manage"]);
  const parsed = itemSchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_INPUT");
  const input = parsed.data;

  // Een adres mag een pad op deze site zijn of een volledig adres; dezelfde
  // regel als elders in de admin (zie CLAUDE.md).
  if (input.uri && !isEditableDestination(input.uri)) return saveError("INVALID_URL");

  const cfg = await getVaultConfig();
  if (!cfg) return saveError("NOT_CONFIGURED");

  try {
    const post = await requireVaultPost(session, input.vaultPostId);
    const payload = {
      name: input.name,
      username: input.username || null,
      password: input.password || null,
      uri: input.uri || null,
      notes: input.notes || null,
    };

    if (input.itemId) {
      // Een leeg wachtwoordveld bij een bewerking betekent "laat staan", niet
      // "maak leeg": een bewerkformulier vult een wachtwoord niet voor, dus
      // zonder deze stap wist elke naamswijziging het wachtwoord.
      if (!payload.password) {
        const existing = await revealVaultItem(cfg, post.collectionId, input.itemId);
        if (!existing) return saveError("ITEM_GONE");
        payload.password = existing.password;
      }
      const ok = await updateVaultItem(cfg, post.collectionId, input.itemId, payload);
      if (!ok) return saveError("ITEM_GONE");
      await logAudit({
        action: "update",
        entity: "vaultItem",
        entityId: input.itemId,
        target: `${post.groupName}: ${input.name}`,
      });
    } else {
      const id = await createVaultItem(cfg, post.collectionId, payload);
      await logAudit({
        action: "create",
        entity: "vaultItem",
        entityId: id,
        target: `${post.groupName}: ${input.name}`,
      });
    }
  } catch (err) {
    return saveError(toCode(err));
  }

  revalidatePath("/admin/wachtwoorden");
  return saveOk();
}

export async function deleteVaultItemAction(formData: FormData): Promise<void> {
  const session = await requireAnyPermission(["vault.editOwn", "vault.manage"]);
  const vaultPostId = String(formData.get("vaultPostId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const name = String(formData.get("name") ?? "");
  if (!vaultPostId || !itemId) return;

  const cfg = await getVaultConfig();
  if (!cfg) return;

  const post = await requireVaultPost(session, vaultPostId);
  const removed = await deleteVaultItem(cfg, post.collectionId, itemId);
  if (removed) {
    await logAudit({
      action: "delete",
      entity: "vaultItem",
      entityId: itemId,
      target: `${post.groupName}: ${name}`,
    });
  }
  revalidatePath("/admin/wachtwoorden");
}

/**
 * Geeft één wachtwoord terug, zodat de lijst ze niet allemaal hoeft mee te
 * sturen.
 *
 * Dit is een leesactie en die logboeken we normaal niet (zie `lib/audit.ts`),
 * maar bij een kluis is net het lezen wat je achteraf wil kunnen navragen: "wie
 * heeft dat wachtwoord opgevraagd voor het uitlekte" is de enige vraag die er
 * dan toe doet.
 */
export async function revealVaultItemAction(
  vaultPostId: string,
  itemId: string,
): Promise<{ ok: true; password: string | null } | { ok: false; code: string }> {
  const session = await requireAnyPermission(["vault.editOwn", "vault.manage"]);
  const cfg = await getVaultConfig();
  if (!cfg) return { ok: false, code: "NOT_CONFIGURED" };

  try {
    const post = await requireVaultPost(session, vaultPostId);
    const item = await revealVaultItem(cfg, post.collectionId, itemId);
    if (!item) return { ok: false, code: "ITEM_GONE" };
    await logAudit({
      action: "grant",
      entity: "vaultItem",
      entityId: itemId,
      target: `${post.groupName}: ${item.name}`,
      summary: "Wachtwoord bekeken in de admin",
    });
    return { ok: true, password: item.password };
  } catch (err) {
    return { ok: false, code: toCode(err) };
  }
}

// -----------------------------------------------------------------------------
// Beheer (IT)
// -----------------------------------------------------------------------------

export async function setVaultPostAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("vault.manage");
  const groupId = String(formData.get("groupId") ?? "");
  const enabled = formData.get("enabled") === "1";
  if (!groupId) return saveError("INVALID_INPUT");

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { nameNl: true },
  });
  if (!group) return saveError("INVALID_INPUT");

  await prisma.vaultPost.upsert({
    where: { groupId },
    create: { groupId, enabled },
    update: { enabled },
  });
  await logAudit({
    action: enabled ? "grant" : "revoke",
    entity: "vaultPost",
    entityId: groupId,
    target: group.nameNl,
    summary: enabled ? "Post gekoppeld aan de wachtwoordkluis" : "Post losgekoppeld",
  });

  revalidatePath("/admin/wachtwoorden/beheer");
  revalidatePath("/admin/wachtwoorden");
  return saveOk();
}

export async function unlinkVaultPostAction(formData: FormData): Promise<void> {
  await requirePermission("vault.manage");
  const groupId = String(formData.get("groupId") ?? "");
  if (!groupId) return;
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { nameNl: true },
  });
  await prisma.vaultPost.updateMany({ where: { groupId }, data: { enabled: false } });
  await logAudit({
    action: "revoke",
    entity: "vaultPost",
    entityId: groupId,
    target: group?.nameNl ?? groupId,
    summary: "Post losgekoppeld van de wachtwoordkluis",
  });
  revalidatePath("/admin/wachtwoorden/beheer");
  revalidatePath("/admin/wachtwoorden");
}

// Geen parameters: deze action leest niets uit het formulier. Een `SaveAction`
// met minder parameters is gewoon toewijsbaar, en dat is netter dan twee
// argumenten meeslepen die niemand gebruikt.
export const syncVaultAction: SaveAction = async () => {
  await requirePermission("vault.manage");
  const result = await reconcileVault();
  if ("skipped" in result) return saveError("NOT_CONFIGURED");

  await logAudit({
    action: "sync",
    entity: "vaultPost",
    target: "Wachtwoordkluis",
    summary: `${result.posts} posten, ${result.invited} uitgenodigd, ${result.confirmed} bevestigd, ${result.removed} verwijderd`,
  });
  revalidatePath("/admin/wachtwoorden/beheer");
  if (result.failed > 0) return saveError("SYNC_PARTIAL");
  return saveOk();
};
