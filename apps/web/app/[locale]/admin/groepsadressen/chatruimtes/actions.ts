"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { type SaveState, saveError, saveOk } from "@/lib/saveState";
import { getGoogleConfig, type GoogleConfig } from "@/lib/google/config";
import {
  addChatMember,
  assertChatSpaceId,
  deleteChatSpace,
  getChatSpace,
  removeChatMember,
  setChatMemberRole,
  updateChatSpace,
} from "@/lib/google/client";
import { directoryAddresses } from "@/lib/google/aliases";
import { normaliseAddress } from "@/lib/google/recipients";
import { chatErrorCode, parseChatRole } from "@/lib/google/chatSpaces";

/**
 * Chatruimtes beheren (Google Admin › Chatruimtes), rechtstreeks in Google
 * Chat met beheerderstoegang. De site bewaart niets van een ruimte. Een
 * verwachte fout (een bezette naam, een ontbrekende delegatie) wordt een rode
 * toast; enkel het onverwachte gooit.
 */

const BASE = "/admin/groepsadressen/chatruimtes";

async function setup(): Promise<GoogleConfig | null> {
  await requirePermission("mailgroups.manage");
  return getGoogleConfig();
}

function spaceIdFrom(formData: FormData): string | null {
  try {
    return assertChatSpaceId(String(formData.get("spaceId") ?? ""));
  } catch {
    return null;
  }
}

function fail(err: unknown): SaveState {
  const code = chatErrorCode(err);
  if (!code) throw err;
  return saveError(code);
}

function refresh(spaceId: string) {
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${spaceId}`);
}

async function spaceLabel(cfg: GoogleConfig, spaceId: string): Promise<string> {
  const space = await getChatSpace(cfg, spaceId).catch(() => null);
  return space?.displayName ?? `spaces/${spaceId}`;
}

/** Naam, beschrijving en richtlijnen van een ruimte. */
export async function updateChatSpaceAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const cfg = await setup();
  if (!cfg) return saveError("NOT_CONFIGURED");
  const spaceId = spaceIdFrom(formData);
  if (!spaceId) return saveError("NOT_FOUND");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const guidelines = String(formData.get("guidelines") ?? "").trim();
  if (!displayName || displayName.length > 128) return saveError("INVALID_NAME");
  // De grenzen van Chat zelf.
  if (description.length > 150) return saveError("DESCRIPTION_TOO_LONG");
  if (guidelines.length > 5000) return saveError("GUIDELINES_TOO_LONG");
  try {
    await updateChatSpace(cfg, spaceId, { displayName, description, guidelines });
  } catch (err) {
    return fail(err);
  }
  await logAudit({
    action: "update",
    entity: "chatSpace",
    entityId: spaceId,
    target: displayName,
    summary: "naam en beschrijving van de chatruimte gewijzigd",
  });
  refresh(spaceId);
  return saveOk();
}

/**
 * Iemand of een groep toevoegen, op adres (hoofdadres of alias). Enkel adressen
 * van het domein: Chat aanvaardt met beheerderstoegang geen externe leden.
 */
export async function addChatMemberAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const cfg = await setup();
  if (!cfg) return saveError("NOT_CONFIGURED");
  const spaceId = spaceIdFrom(formData);
  if (!spaceId) return saveError("NOT_FOUND");
  const address = normaliseAddress(String(formData.get("address") ?? ""), cfg.domain);
  if (!address) return saveError("ADDRESS_REQUIRED");
  const directory = await directoryAddresses(cfg);
  const owner = directory.byAddress.get(address);
  if (!owner) return saveError("NOT_IN_DOMAIN");
  try {
    await addChatMember(
      cfg,
      spaceId,
      owner.kind === "group" ? { groupId: owner.id } : { userEmail: owner.email },
    );
  } catch (err) {
    return fail(err);
  }
  await logAudit({
    action: "create",
    entity: "chatSpace",
    entityId: spaceId,
    target: await spaceLabel(cfg, spaceId),
    summary: `${owner.kind === "group" ? "groep" : "lid"} ${owner.email} toegevoegd aan de chatruimte`,
  });
  refresh(spaceId);
  return saveOk();
}

export async function setChatMemberRoleAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const cfg = await setup();
  if (!cfg) return saveError("NOT_CONFIGURED");
  const spaceId = spaceIdFrom(formData);
  const membershipName = String(formData.get("membership") ?? "");
  const role = parseChatRole(String(formData.get("role") ?? ""));
  if (!spaceId || !role || !membershipName.startsWith(`spaces/${spaceId}/members/`)) {
    return saveError("NOT_FOUND");
  }
  try {
    await setChatMemberRole(cfg, membershipName, role);
  } catch (err) {
    return fail(err);
  }
  await logAudit({
    action: "update",
    entity: "chatSpace",
    entityId: spaceId,
    target: await spaceLabel(cfg, spaceId),
    summary: `rol van ${String(formData.get("label") ?? membershipName)} gewijzigd naar ${role}`,
  });
  refresh(spaceId);
  return saveOk();
}

export async function removeChatMemberAction(formData: FormData): Promise<SaveState> {
  const cfg = await setup();
  if (!cfg) return saveError("NOT_CONFIGURED");
  const spaceId = spaceIdFrom(formData);
  const membershipName = String(formData.get("membership") ?? "");
  if (!spaceId || !membershipName.startsWith(`spaces/${spaceId}/members/`)) return saveError("NOT_FOUND");
  try {
    await removeChatMember(cfg, membershipName);
  } catch (err) {
    return fail(err);
  }
  await logAudit({
    action: "delete",
    entity: "chatSpace",
    entityId: spaceId,
    target: await spaceLabel(cfg, spaceId),
    summary: `${String(formData.get("label") ?? membershipName)} uit de chatruimte gehaald`,
  });
  refresh(spaceId);
  return saveOk();
}

/**
 * Een ruimte verwijderen, met al haar berichten en bestanden. Onomkeerbaar,
 * dus enkel via de bevestiging. Geen redirect: de lijst laat de ruimte vallen
 * na `revalidatePath`, en de detailpagina zegt dat ze er niet meer is.
 */
export async function deleteChatSpaceAction(formData: FormData): Promise<SaveState> {
  const cfg = await setup();
  if (!cfg) return saveError("NOT_CONFIGURED");
  const spaceId = spaceIdFrom(formData);
  if (!spaceId) return saveError("NOT_FOUND");
  const label = await spaceLabel(cfg, spaceId);
  try {
    await deleteChatSpace(cfg, spaceId);
  } catch (err) {
    return fail(err);
  }
  await logAudit({
    action: "delete",
    entity: "chatSpace",
    entityId: spaceId,
    target: label,
    summary: "chatruimte verwijderd, met berichten en leden",
  });
  refresh(spaceId);
  return saveOk();
}
