import "server-only";

import type { Prisma } from "@prisma/client";
import { needsStudyConfirmation } from "@vtk/auth";
import { prisma } from "@vtk/db";
import {
  addMemberRole,
  deleteChannelMessage,
  discordGuildConfigured,
  editChannelMessage,
  removeMemberRole,
  sendChannelMessage,
  type BotResult,
} from "./bot";
import { discordLinkPanelMessage } from "./pollMessages";
import { desiredPocRoleIds, managedRoleIds, pocsForAccount, roleChanges, type RoleAccount } from "./pocRoles";

/**
 * Wie welk POC-kanaal ziet op Discord: de bot geeft de rol van de POC aan wie zijn
 * account koppelde, en die rol volgt daarna wat er op de site staat.
 *
 * Een wijziging van richting raakt hier niets rechtstreeks: de worker vergelijkt
 * elke vijf minuten wat er hoort te staan met wat de site al uitdeelde. Daardoor
 * loopt ook een nieuwe rol in /admin/pocs of het begin van een academiejaar
 * vanzelf mee, zonder iets in de opslaan-acties van het profiel.
 */

/** Discord begrenst rolwijzigingen; wat niet past, schuift door naar de volgende ronde. */
const SYNC_BATCH = 20;
const LINK_PANEL_SETTING = "discord.linkPanel";
const ROLE_SYNC_ERROR_SETTING = "discord.roleSyncError";

export const ROLE_ACCOUNT_SELECT = {
  id: true,
  discordId: true,
  discordRoleIds: true,
  active: true,
  deletedAt: true,
  isStudent: true,
  studyConfirmedYear: true,
  studyProgrammes: true,
} satisfies Prisma.UserSelect;

type LinkedAccount = Prisma.UserGetPayload<{ select: typeof ROLE_ACCOUNT_SELECT }>;

export function loadRolePocs() {
  return prisma.poc.findMany({
    where: { discordRoleId: { not: null } },
    orderBy: { order: "asc" },
    select: { nameNl: true, discordRoleId: true, studyProgrammes: true },
  });
}

type Pocs = Awaited<ReturnType<typeof loadRolePocs>>;

export function roleAccount(account: LinkedAccount, now: Date): RoleAccount {
  return {
    live: account.active && !account.deletedAt,
    confirmed: !needsStudyConfirmation(account, now),
    programmes: account.studyProgrammes,
  };
}

/** De namen van de POC's die dit account mag zien, zoals op Discord getoond. */
export function accessiblePocNames(pocs: Pocs, account: LinkedAccount, now: Date): string[] {
  return pocsForAccount(pocs, roleAccount(account, now)).map((poc) => poc.nameNl.replace(/^POC\s+/i, ""));
}

type Applied = { ok: true } | { ok: false; status: number | null; message: string };

function roleFailure(result: Exclude<BotResult<void>, { ok: true }>): Applied {
  return {
    ok: false,
    status: result.status,
    message:
      result.status === 403
        ? "De bot mag deze rol niet geven. Geef de bot het recht Manage Roles en zet de rol van de bot boven de POC-rollen."
        : result.message,
  };
}

async function applyRoleChanges(discordId: string, changes: { add: string[]; remove: string[] }): Promise<Applied> {
  const steps = [
    ...changes.add.map((roleId) => () => addMemberRole(discordId, roleId)),
    ...changes.remove.map((roleId) => () => removeMemberRole(discordId, roleId)),
  ];
  for (const step of steps) {
    const result = await step();
    // 404: het lid verliet de server of de rol bestaat niet meer. Opnieuw proberen
    // helpt niet; wie terugkomt, drukt op de knop onder het koppelbericht.
    if (!result.ok && result.status !== 404) return roleFailure(result);
  }
  return { ok: true };
}

function isDifferent(changes: { add: string[]; remove: string[] }): boolean {
  return changes.add.length > 0 || changes.remove.length > 0;
}

function pendingAccounts(pocs: Pocs, accounts: LinkedAccount[], now: Date) {
  return accounts.flatMap((account) => {
    if (!account.discordId) return [];
    const desired = desiredPocRoleIds(pocs, roleAccount(account, now));
    const changes = roleChanges(account.discordRoleIds, desired);
    return isDifferent(changes) ? [{ id: account.id, discordId: account.discordId, desired, changes }] : [];
  });
}

function linkedAccounts() {
  return prisma.user.findMany({ where: { discordId: { not: null } }, select: ROLE_ACCOUNT_SELECT });
}

function storeRoles(userId: string, roleIds: string[]) {
  return prisma.user.update({ where: { id: userId }, data: { discordRoleIds: { set: roleIds } } });
}

/** De worker: brengt een beperkt aantal accounts per ronde gelijk met de site. */
export async function syncPocDiscordRoles(now: Date): Promise<{ changed: number; waiting: number }> {
  if (!discordGuildConfigured()) return { changed: 0, waiting: 0 };
  const [pocs, accounts] = await Promise.all([loadRolePocs(), linkedAccounts()]);
  const due = pendingAccounts(pocs, accounts, now);

  let changed = 0;
  for (const item of due.slice(0, SYNC_BATCH)) {
    const result = await applyRoleChanges(item.discordId, item.changes);
    if (!result.ok) {
      // 429 is geen fout: Discord vraagt te wachten, de volgende ronde gaat verder.
      if (result.status !== 429) {
        const value = { message: result.message, at: now.toISOString() };
        await prisma.setting.upsert({
          where: { key: ROLE_SYNC_ERROR_SETTING },
          update: { value },
          create: { key: ROLE_SYNC_ERROR_SETTING, value },
        });
      }
      return { changed, waiting: due.length - changed };
    }
    await storeRoles(item.id, item.desired);
    changed += 1;
  }

  await prisma.setting.deleteMany({ where: { key: ROLE_SYNC_ERROR_SETTING } });
  return { changed, waiting: due.length - changed };
}

/** Meteen na het koppelen. Lukt het niet, dan haalt de worker het in. */
export async function syncDiscordRolesForUser(userId: string, now: Date = new Date()): Promise<void> {
  if (!discordGuildConfigured()) return;
  const [pocs, account] = await Promise.all([
    loadRolePocs(),
    prisma.user.findUnique({ where: { id: userId }, select: ROLE_ACCOUNT_SELECT }),
  ]);
  if (!account?.discordId) return;
  const desired = desiredPocRoleIds(pocs, roleAccount(account, now));
  const changes = roleChanges(account.discordRoleIds, desired);
  if (!isDifferent(changes)) return;
  const result = await applyRoleChanges(account.discordId, changes);
  if (result.ok) await storeRoles(account.id, desired);
}

/**
 * Na een klik op het koppelbericht. Discord geeft de echte rollen van het lid mee,
 * dus dit herstelt ook wat de worker niet kan zien: iemand die de server verliet
 * en terugkwam, of een rol die met de hand weggehaald is.
 */
export async function repairDiscordRoles(input: {
  account: LinkedAccount;
  memberRoleIds: readonly string[];
  pocs: Pocs;
  now: Date;
}): Promise<void> {
  const { account, memberRoleIds, pocs, now } = input;
  if (!account.discordId || !discordGuildConfigured()) return;
  const desired = desiredPocRoleIds(pocs, roleAccount(account, now));
  const changes = roleChanges(managedRoleIds(memberRoleIds, pocs, account.discordRoleIds), desired);
  const result = await applyRoleChanges(account.discordId, changes);
  if (result.ok) await storeRoles(account.id, desired);
}

/** Bij ontkoppelen, wisselen van account of wissen van de gegevens. */
export async function removeDiscordRoles(discordId: string, roleIds: readonly string[]): Promise<void> {
  if (roleIds.length === 0 || !discordGuildConfigured()) return;
  for (const roleId of roleIds) await removeMemberRole(discordId, roleId);
}

// ---- Het koppelbericht ------------------------------------------------------

export type LinkPanel = { channelId: string; messageId: string };

async function readLinkPanel(): Promise<LinkPanel | null> {
  const row = await prisma.setting.findUnique({ where: { key: LINK_PANEL_SETTING } });
  const value = row?.value as Partial<LinkPanel> | null | undefined;
  return value?.channelId && value.messageId ? { channelId: value.channelId, messageId: value.messageId } : null;
}

/** Zet het bericht in dit kanaal, of werkt het bij als het daar al staat. */
export async function placeLinkPanel(channelId: string): Promise<BotResult<{ id: string }>> {
  const current = await readLinkPanel();
  const message = discordLinkPanelMessage();
  if (current?.channelId === channelId) {
    const edited = await editChannelMessage(channelId, current.messageId, message);
    // 404: iemand verwijderde het bericht, dan staat het hieronder opnieuw.
    if (edited.ok || edited.status !== 404) return edited;
  }
  const posted = await sendChannelMessage(channelId, message);
  if (!posted.ok) return posted;
  const value = { channelId, messageId: posted.data.id };
  await prisma.setting.upsert({
    where: { key: LINK_PANEL_SETTING },
    update: { value },
    create: { key: LINK_PANEL_SETTING, value },
  });
  if (current && current.channelId !== channelId) await deleteChannelMessage(current.channelId, current.messageId);
  return posted;
}

export type DiscordAccessStatus = {
  linked: number;
  waiting: number;
  panelChannelId: string | null;
  error: string | null;
};

/** Wat het beheer toont: hoeveel accounts, wat er nog moet, en wat misliep. */
export async function discordAccessStatus(now: Date = new Date()): Promise<DiscordAccessStatus> {
  const [pocs, accounts, panel, errorRow] = await Promise.all([
    loadRolePocs(),
    linkedAccounts(),
    readLinkPanel(),
    prisma.setting.findUnique({ where: { key: ROLE_SYNC_ERROR_SETTING } }),
  ]);
  const error = (errorRow?.value as { message?: unknown } | null | undefined)?.message;
  return {
    linked: accounts.length,
    waiting: pendingAccounts(pocs, accounts, now).length,
    panelChannelId: panel?.channelId ?? null,
    error: typeof error === "string" ? error : null,
  };
}
