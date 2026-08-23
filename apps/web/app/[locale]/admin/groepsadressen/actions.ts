"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { type SaveState, saveError, saveOk } from "@/lib/saveState";
import { getGoogleConfig } from "@/lib/google/config";
import { collectLinkCandidates } from "@/lib/google/link";
import { normaliseEmail } from "@/lib/google/members";
import { pushMailGroupsForGroup, reconcileMailGroups } from "@/lib/google/sync";

/**
 * Server actions van de groepsadressen (Google Workspace).
 *
 * Twee dingen die overal terugkomen:
 *
 * - **Verwachte fouten komen terug, ze worden niet gegooid** (zie CLAUDE.md).
 *   Een adres dat al bestaat of een onbereikbaar Google hoort een rode toast te
 *   geven, geen error boundary.
 * - **Een wijziging aan de regel duwt niet meteen naar Google.** De reconcile
 *   doet dat binnen de vijf minuten, en de knop "Nu synchroniseren" doet het
 *   onmiddellijk. Enkel een gewijzigde bron duwt wel, want dan verandert
 *   effectief wie er in de lijst zit.
 */

const ADMIN = "/admin/groepsadressen";

function fields(formData: FormData) {
  return Object.fromEntries(formData.entries()) as Record<string, string>;
}

const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "geen geldig adres");

const groupSchema = z.object({
  id: z.string().optional(),
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  allowExternalSenders: z.string().optional(),
});

export async function saveMailGroupAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const parsed = groupSchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_INPUT");
  const input = parsed.data;
  const email = normaliseEmail(input.email);

  const data = {
    email,
    name: input.name,
    description: input.description || null,
    // Een checkbox stuurt niets mee wanneer ze uit staat.
    allowExternalSenders: input.allowExternalSenders === "on",
  };

  const clash = await prisma.mailGroup.findUnique({ where: { email }, select: { id: true } });
  if (clash && clash.id !== input.id) return saveError("DUPLICATE_EMAIL");

  if (input.id) {
    await prisma.mailGroup.update({ where: { id: input.id }, data });
    await logAudit({
      action: "update",
      entity: "mailGroup",
      entityId: input.id,
      target: email,
      summary: "groepsadres bijgewerkt",
    });
  } else {
    const created = await prisma.mailGroup.create({ data });
    await logAudit({
      action: "create",
      entity: "mailGroup",
      entityId: created.id,
      target: email,
      summary: "groepsadres toegevoegd",
    });
  }

  revalidatePath(ADMIN);
  return saveOk();
}

export async function deleteMailGroupAction(formData: FormData): Promise<void> {
  await requirePermission("mailgroups.manage");
  const id = (formData.get("id") as string) ?? "";
  if (!id) return;

  const row = await prisma.mailGroup.findUnique({ where: { id }, select: { email: true } });
  if (!row) return;

  // Enkel onze regel verdwijnt. De groep in Google blijft bestaan: daar hangt
  // het archief aan en het adres staat op affiches en in mailhandtekeningen.
  await prisma.mailGroup.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "mailGroup",
    entityId: id,
    target: row.email,
    summary: "koppeling verwijderd; de groep in Google blijft bestaan",
  });
  revalidatePath(ADMIN);
}

const sourceSchema = z.object({
  mailGroupId: z.string().min(1),
  groupId: z.string().min(1),
  onlyLead: z.string().optional(),
});

export async function addSourceAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const parsed = sourceSchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_INPUT");
  const { mailGroupId, groupId } = parsed.data;
  const onlyLead = parsed.data.onlyLead === "on";

  const [mailGroup, group] = await Promise.all([
    prisma.mailGroup.findUnique({ where: { id: mailGroupId }, select: { email: true } }),
    prisma.group.findUnique({ where: { id: groupId }, select: { nameNl: true } }),
  ]);
  if (!mailGroup || !group) return saveError("INVALID_INPUT");

  const existing = await prisma.mailGroupSource.findUnique({
    where: { mailGroupId_groupId_onlyLead: { mailGroupId, groupId, onlyLead } },
    select: { id: true },
  });
  if (existing) return saveError("DUPLICATE_SOURCE");

  await prisma.mailGroupSource.create({ data: { mailGroupId, groupId, onlyLead } });
  await logAudit({
    action: "update",
    entity: "mailGroup",
    entityId: mailGroupId,
    target: mailGroup.email,
    summary: `bron toegevoegd: ${group.nameNl}${onlyLead ? " (enkel de verantwoordelijke)" : ""}`,
  });

  revalidatePath(ADMIN);
  after(() => pushMailGroupsForGroup(groupId));
  return saveOk();
}

export async function removeSourceAction(formData: FormData): Promise<void> {
  await requirePermission("mailgroups.manage");
  const id = (formData.get("id") as string) ?? "";
  if (!id) return;

  const row = await prisma.mailGroupSource.findUnique({
    where: { id },
    select: { groupId: true, mailGroupId: true, mailGroup: { select: { email: true } }, group: { select: { nameNl: true } } },
  });
  if (!row) return;

  await prisma.mailGroupSource.delete({ where: { id } });
  await logAudit({
    action: "update",
    entity: "mailGroup",
    entityId: row.mailGroupId,
    target: row.mailGroup.email,
    summary: `bron verwijderd: ${row.group.nameNl}`,
  });
  revalidatePath(ADMIN);
  after(() => pushMailGroupsForGroup(row.groupId));
}

const extraSchema = z.object({
  mailGroupId: z.string().min(1),
  email: emailSchema,
  kind: z.enum(["INCLUDE", "EXCLUDE"]),
  note: z.string().trim().max(200).optional(),
});

export async function addExtraAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const parsed = extraSchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_EMAIL");
  const { mailGroupId, kind } = parsed.data;
  const email = normaliseEmail(parsed.data.email);

  const mailGroup = await prisma.mailGroup.findUnique({
    where: { id: mailGroupId },
    select: { email: true },
  });
  if (!mailGroup) return saveError("INVALID_INPUT");

  const existing = await prisma.mailGroupExtra.findUnique({
    where: { mailGroupId_email: { mailGroupId, email } },
    select: { id: true },
  });
  if (existing) return saveError("DUPLICATE_EMAIL");

  await prisma.mailGroupExtra.create({
    data: { mailGroupId, email, kind, note: parsed.data.note || null },
  });
  await logAudit({
    action: "update",
    entity: "mailGroup",
    entityId: mailGroupId,
    target: mailGroup.email,
    summary: `${kind === "INCLUDE" ? "extra adres" : "uitsluiting"} toegevoegd: ${email}`,
  });

  revalidatePath(ADMIN);
  return saveOk();
}

export async function removeExtraAction(formData: FormData): Promise<void> {
  await requirePermission("mailgroups.manage");
  const id = (formData.get("id") as string) ?? "";
  if (!id) return;

  const row = await prisma.mailGroupExtra.findUnique({
    where: { id },
    select: { email: true, mailGroupId: true, mailGroup: { select: { email: true } } },
  });
  if (!row) return;

  await prisma.mailGroupExtra.delete({ where: { id } });
  await logAudit({
    action: "update",
    entity: "mailGroup",
    entityId: row.mailGroupId,
    target: row.mailGroup.email,
    summary: `adres losgekoppeld: ${row.email}`,
  });
  revalidatePath(ADMIN);
}

export async function syncMailGroupsAction(): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const result = await reconcileMailGroups();
  if ("skipped" in result) return saveError("NOT_CONFIGURED");

  await logAudit({
    action: "sync",
    entity: "mailGroup",
    target: "Groepsadressen",
    summary: `${result.groups} lijsten, ${result.added} toegevoegd, ${result.removed} verwijderd`,
  });
  revalidatePath(ADMIN);
  if (result.failed > 0) return saveError("SYNC_PARTIAL");
  return saveOk();
}

// -----------------------------------------------------------------------------
// Koppelen van @vtk.be-accounts aan leden
// -----------------------------------------------------------------------------

const linkSchema = z.object({
  userId: z.string().min(1),
  googleUserId: z.string().min(1),
  googleEmail: emailSchema,
});

/**
 * Koppelt één Google-account aan één lid. Het adres moet op het beheerde domein
 * staan: een privé-Gmail koppelen zou interne post naar buiten sturen zonder dat
 * iemand die keuze bewust maakte.
 */
export async function linkGoogleAccountAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const parsed = linkSchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_INPUT");
  const googleEmail = normaliseEmail(parsed.data.googleEmail);

  const cfg = await getGoogleConfig();
  if (!cfg) return saveError("NOT_CONFIGURED");
  if (!googleEmail.endsWith(`@${cfg.domain}`)) return saveError("WRONG_DOMAIN");

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { name: true },
  });
  if (!user) return saveError("INVALID_INPUT");

  const taken = await prisma.user.findFirst({
    where: {
      id: { not: parsed.data.userId },
      OR: [{ googleUserId: parsed.data.googleUserId }, { googleEmail }],
    },
    select: { name: true },
  });
  if (taken) return saveError("ALREADY_LINKED");

  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: {
      googleUserId: parsed.data.googleUserId,
      googleEmail,
      googleLinkedAt: new Date(),
    },
  });
  await logAudit({
    action: "update",
    entity: "user",
    entityId: parsed.data.userId,
    target: user.name,
    summary: `gekoppeld aan het Google-account ${googleEmail}`,
  });

  revalidatePath(ADMIN);
  revalidatePath(`${ADMIN}/koppelingen`);
  return saveOk();
}

/**
 * Koppelt in één keer alle eenduidige voorstellen.
 *
 * Herberekent ze server-side in plaats van de paren uit het formulier te
 * gebruiken: een lijst die de browser meestuurt, is een lijst die de browser kan
 * wijzigen. Twijfelgevallen (naamgenoten) zitten per definitie niet in de
 * voorstellen en blijven dus handwerk.
 */
export async function linkAllSuggestionsAction(): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const cfg = await getGoogleConfig();
  if (!cfg) return saveError("NOT_CONFIGURED");

  let candidates;
  try {
    candidates = await collectLinkCandidates(cfg);
  } catch {
    return saveError("GOOGLE_UNREACHABLE");
  }
  if (candidates.matches.length === 0) return saveOk();

  const now = new Date();
  let linked = 0;
  for (const match of candidates.matches) {
    try {
      await prisma.user.update({
        where: { id: match.userId },
        data: {
          googleUserId: match.googleUserId,
          googleEmail: normaliseEmail(match.googleEmail),
          googleLinkedAt: now,
        },
      });
      linked += 1;
    } catch {
      // Een unieke-sleutelbotsing betekent dat iemand anders dat account
      // ondertussen kreeg. De rest van de voorstellen mag gewoon doorgaan.
    }
  }

  await logAudit({
    action: "update",
    entity: "user",
    target: "Google-koppelingen",
    summary: `${linked} leden gekoppeld aan hun @vtk.be-account`,
  });

  revalidatePath(ADMIN);
  revalidatePath(`${ADMIN}/koppelingen`);
  return saveOk();
}

export async function unlinkGoogleAccountAction(formData: FormData): Promise<void> {
  await requirePermission("mailgroups.manage");
  const userId = (formData.get("userId") as string) ?? "";
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, googleEmail: true },
  });
  if (!user) return;

  await prisma.user.update({
    where: { id: userId },
    data: { googleUserId: null, googleEmail: null, googleLinkedAt: null },
  });
  await logAudit({
    action: "update",
    entity: "user",
    entityId: userId,
    target: user.name,
    summary: `koppeling met ${user.googleEmail ?? "Google"} verwijderd`,
  });

  revalidatePath(ADMIN);
  revalidatePath(`${ADMIN}/koppelingen`);
}
