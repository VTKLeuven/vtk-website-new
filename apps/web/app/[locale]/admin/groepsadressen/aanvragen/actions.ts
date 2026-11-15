"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { type SaveState, saveError, saveOk } from "@/lib/saveState";
import { getGoogleConfig, getGoogleStatus } from "@/lib/google/config";
import { mailGroupAccess } from "@/lib/google/access";
import { pushMailGroupsForGroup } from "@/lib/google/sync";
import {
  type ApproveOutcome,
  approveWerkgroepAccount,
  rejectWerkgroepAccount,
  requestWerkgroepAccounts,
} from "@/lib/google/werkgroepAccounts";

/**
 * Accounts van werkgroepen: aanvragen (de werkgroep), goedkeuren of weigeren
 * (IT of de vice), en het voorvoegsel van een werkgroep (IT).
 */

const PATH = "/admin/groepsadressen/aanvragen";

export async function requestAccountsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const access = await mailGroupAccess();
  const groupId = String(formData.get("groupId") ?? "");
  if (!access.manageAll && !access.werkgroepIds.has(groupId)) throw new Error("FORBIDDEN");
  const userIds = formData.getAll("userId").map(String).filter(Boolean);
  if (userIds.length === 0) return saveError("NOTHING_SELECTED");

  const domain = (await getGoogleStatus()).domain ?? "vtk.be";
  const outcome = await requestWerkgroepAccounts({
    groupId,
    userIds,
    requestedById: access.session.user.id,
    domain,
  });
  revalidatePath(PATH);
  revalidatePath("/admin/groepsadressen");
  if (outcome.requested === 0) return saveError("NOTHING_REQUESTED");
  return saveOk();
}

export type DecideState =
  | { status: "idle" }
  | { status: "error"; code: string; nonce: number }
  | { status: "approved"; results: ApproveOutcome[]; nonce: number }
  | { status: "rejected"; count: number; nonce: number };

/**
 * Keurt de aangevinkte aanvragen goed (en maakt de accounts meteen aan), of
 * weigert ze met één reden. Eén formulier met twee knoppen: `decision` zegt
 * welke.
 */
export async function decideAccountsAction(_prev: DecideState, formData: FormData): Promise<DecideState> {
  const session = await requirePermission("googleAccounts.manage");
  const ids = [...new Set(formData.getAll("id").map(String).filter(Boolean))];
  if (ids.length === 0) return { status: "error", code: "NOTHING_SELECTED", nonce: Date.now() };
  const decision = formData.get("decision");

  if (decision === "reject") {
    const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
    let count = 0;
    for (const id of ids) if (await rejectWerkgroepAccount(id, reason, session.user.id)) count += 1;
    revalidatePath(PATH);
    return { status: "rejected", count, nonce: Date.now() };
  }

  const cfg = await getGoogleConfig();
  if (!cfg) return { status: "error", code: "NOT_CONFIGURED", nonce: Date.now() };

  const groupIds = new Set(
    (await prisma.werkgroepAccount.findMany({ where: { id: { in: ids } }, select: { groupId: true } })).map(
      (r) => r.groupId,
    ),
  );
  const results: ApproveOutcome[] = [];
  for (const id of ids) results.push(await approveWerkgroepAccount(cfg, id, session.user.id));

  revalidatePath(PATH);
  revalidatePath("/admin/groepsadressen", "layout");
  // In de lijsten van de werkgroep krijgt het lid nu zijn werkgroepadres.
  after(async () => {
    for (const groupId of groupIds) await pushMailGroupsForGroup(groupId);
  });
  return { status: "approved", results, nonce: Date.now() };
}

const prefixSchema = z.object({
  groupId: z.string().min(1),
  mailPrefix: z
    .string()
    .trim()
    .toLowerCase()
    .max(30)
    .regex(/^([a-z0-9]+)?$/),
});

/**
 * Het voorvoegsel van een werkgroep (statix). Enkel IT: het bepaalt welke
 * adressen de werkgroep zelf mag maken, en een adres op een affiche verander
 * je niet zomaar.
 */
export async function saveMailPrefixAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const parsed = prefixSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return saveError("INVALID_PREFIX");
  const mailPrefix = parsed.data.mailPrefix || null;

  if (mailPrefix) {
    const clash = await prisma.group.findUnique({ where: { mailPrefix }, select: { id: true } });
    if (clash && clash.id !== parsed.data.groupId) return saveError("DUPLICATE_PREFIX");
  }
  const group = await prisma.group.update({
    where: { id: parsed.data.groupId },
    data: { mailPrefix },
    select: { nameNl: true },
  });
  await logAudit({
    action: "update",
    entity: "post",
    entityId: parsed.data.groupId,
    target: group.nameNl,
    summary: mailPrefix ? `voorvoegsel van de adressen: ${mailPrefix}` : "voorvoegsel van de adressen gewist",
  });
  revalidatePath(PATH);
  return saveOk();
}
