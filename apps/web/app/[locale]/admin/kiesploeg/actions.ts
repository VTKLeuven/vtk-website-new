"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { type SaveState, saveError, saveOk } from "@/lib/saveState";
import { getGoogleConfig } from "@/lib/google/config";
import { renderAddress } from "@/lib/google/addresses";
import { normaliseEmail } from "@/lib/google/members";
import { pushMailGroupsForKiesploeg } from "@/lib/google/sync";

/**
 * Server actions van de kiesploeg.
 *
 * De kiesploeg is een parallelle structuur naast het praesidium: eigen posten,
 * eigen adressen, en leden met een beperkt account tot ze aantreden. Zie
 * docs/design-decisions.md, "De kiesploeg is een aparte structuur".
 */

const ADMIN = "/admin/kiesploeg";
const ADDRESSES = "/admin/groepsadressen";

function fields(formData: FormData) {
  return Object.fromEntries(formData.entries()) as Record<string, string>;
}

const kiesploegSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[a-z0-9]+$/, "enkel kleine letters en cijfers"),
  workingYear: z.coerce.number().int().min(2020).max(2100),
  formalName: z.string().trim().min(2).max(120),
  informalName: z.string().trim().max(120).optional(),
  accountTemplate: z.string().trim().min(3).max(120),
  aliasTemplate: z.string().trim().min(3).max(120),
  listTemplate: z.string().trim().min(3).max(120),
  active: z.string().optional(),
});

export async function saveKiesploegAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("kiesploeg.manage");
  const parsed = kiesploegSchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_INPUT");
  const input = parsed.data;

  const clash = await prisma.kiesploeg.findUnique({
    where: { code: input.code },
    select: { id: true },
  });
  if (clash && clash.id !== input.id) return saveError("DUPLICATE_CODE");

  const data = {
    code: input.code,
    workingYear: input.workingYear,
    formalName: input.formalName,
    informalName: input.informalName || null,
    accountTemplate: input.accountTemplate,
    aliasTemplate: input.aliasTemplate,
    listTemplate: input.listTemplate,
    // Een afgehandelde ploeg zet je uit: haar lijsten blijven, maar de sync
    // rekent haar leden niet meer mee bij het bepalen van de accountstaat.
    // Een uitgevinkte checkbox stuurt niets mee, vandaar de vergelijking met "on".
    active: input.active === "on",
  };

  if (input.id) {
    await prisma.kiesploeg.update({ where: { id: input.id }, data });
  } else {
    await prisma.kiesploeg.create({ data });
  }
  await logAudit({
    action: input.id ? "update" : "create",
    entity: "kiesploeg",
    entityId: input.id ?? null,
    target: input.formalName,
    summary: `kiesploeg ${input.code} (${input.workingYear})`,
  });

  revalidatePath(ADMIN);
  return saveOk();
}

export async function deleteKiesploegAction(formData: FormData): Promise<void> {
  await requirePermission("kiesploeg.manage");
  const id = (formData.get("id") as string) ?? "";
  if (!id) return;
  const row = await prisma.kiesploeg.findUnique({
    where: { id },
    select: { formalName: true },
  });
  if (!row) return;

  // De kiesploeg en haar posten en leden verdwijnen; de accounts en de groepen
  // in Google blijven staan. Dat is bewust: die zijn van de mensen zelf.
  await prisma.kiesploeg.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "kiesploeg",
    entityId: id,
    target: row.formalName,
    summary: "kiesploeg verwijderd; accounts en groepen in Google blijven bestaan",
  });
  revalidatePath(ADMIN);
  revalidatePath(ADDRESSES);
}

const postSchema = z.object({
  kiesploegId: z.string().min(1),
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[a-z0-9]+$/, "enkel kleine letters en cijfers"),
  name: z.string().trim().min(2).max(60),
  isG5: z.string().optional(),
});

export async function addKiesploegPostAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("kiesploeg.manage");
  const parsed = postSchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_INPUT");
  const { kiesploegId, code, name } = parsed.data;
  const isG5 = parsed.data.isG5 === "on";

  const existing = await prisma.kiesploegPost.findUnique({
    where: { kiesploegId_code: { kiesploegId, code } },
    select: { id: true },
  });
  if (existing) return saveError("DUPLICATE_CODE");

  const count = await prisma.kiesploegPost.count({ where: { kiesploegId } });
  await prisma.kiesploegPost.create({
    data: { kiesploegId, code, name, isG5, order: count },
  });
  await logAudit({
    action: "create",
    entity: "kiesploeg",
    entityId: kiesploegId,
    target: name,
    summary: `kiesploegpost toegevoegd (${code})`,
  });

  revalidatePath(ADMIN);
  revalidatePath(ADDRESSES);
  return saveOk();
}

export async function removeKiesploegPostAction(formData: FormData): Promise<void> {
  await requirePermission("kiesploeg.manage");
  const id = (formData.get("id") as string) ?? "";
  if (!id) return;
  const row = await prisma.kiesploegPost.findUnique({
    where: { id },
    select: { name: true, kiesploegId: true },
  });
  if (!row) return;

  await prisma.kiesploegPost.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "kiesploeg",
    entityId: row.kiesploegId,
    target: row.name,
    summary: "kiesploegpost verwijderd",
  });
  revalidatePath(ADMIN);
  revalidatePath(ADDRESSES);
  after(() => pushMailGroupsForKiesploeg(row.kiesploegId));
}

const memberSchema = z.object({
  kiesploegId: z.string().min(1),
  userId: z.string().min(1),
  postId: z.string().optional(),
  role: z.enum(["MEMBER", "LEAD"]).optional(),
});

export async function addKiesploegMemberAction(formData: FormData): Promise<void> {
  await requirePermission("kiesploeg.manage");
  const parsed = memberSchema.safeParse(fields(formData));
  if (!parsed.success) return;
  const { kiesploegId, userId } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) return;

  await prisma.kiesploegMember.upsert({
    where: { kiesploegId_userId: { kiesploegId, userId } },
    create: {
      kiesploegId,
      userId,
      postId: parsed.data.postId || null,
      role: parsed.data.role ?? "MEMBER",
    },
    update: { postId: parsed.data.postId || null, role: parsed.data.role ?? "MEMBER" },
  });
  await logAudit({
    action: "create",
    entity: "kiesploeg",
    entityId: kiesploegId,
    target: user.name,
    summary: "lid van de kiesploeg",
  });

  revalidatePath(ADMIN);
  revalidatePath(ADDRESSES);
  after(() => pushMailGroupsForKiesploeg(kiesploegId));
}

const updateMemberSchema = z.object({
  id: z.string().min(1),
  postId: z.string().optional(),
  role: z.enum(["MEMBER", "LEAD"]).optional(),
  mailboxActive: z.string().optional(),
  forwardTo: z.string().trim().max(200).optional(),
});

/**
 * Post, rol, mailbox-override en doorstuuradres van één kiesploeglid.
 *
 * De override wordt hier alleen opgeslagen, niet meteen in Google toegepast: dat
 * doet de reconcile. Zo is er één plek waar de accountstaat berekend wordt, en
 * kan dit scherm niet uit de pas lopen met de sync.
 */
export async function saveKiesploegMemberAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("kiesploeg.manage");
  const parsed = updateMemberSchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_INPUT");

  const forwardTo = parsed.data.forwardTo ? normaliseEmail(parsed.data.forwardTo) : null;
  if (forwardTo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(forwardTo)) {
    return saveError("INVALID_EMAIL");
  }

  const row = await prisma.kiesploegMember.findUnique({
    where: { id: parsed.data.id },
    select: { kiesploegId: true, user: { select: { name: true } } },
  });
  if (!row) return saveError("INVALID_INPUT");

  await prisma.kiesploegMember.update({
    where: { id: parsed.data.id },
    data: {
      postId: parsed.data.postId || null,
      role: parsed.data.role ?? "MEMBER",
      mailboxActive: parsed.data.mailboxActive === "on",
      forwardTo,
    },
  });
  await logAudit({
    action: "update",
    entity: "kiesploeg",
    entityId: row.kiesploegId,
    target: row.user.name,
    summary: "kiesploeglid bijgewerkt",
  });

  revalidatePath(ADMIN);
  revalidatePath(ADDRESSES);
  after(() => pushMailGroupsForKiesploeg(row.kiesploegId));
  return saveOk();
}

export async function removeKiesploegMemberAction(formData: FormData): Promise<void> {
  await requirePermission("kiesploeg.manage");
  const id = (formData.get("id") as string) ?? "";
  if (!id) return;
  const row = await prisma.kiesploegMember.findUnique({
    where: { id },
    select: { kiesploegId: true, user: { select: { name: true } } },
  });
  if (!row) return;

  await prisma.kiesploegMember.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "kiesploeg",
    entityId: row.kiesploegId,
    target: row.user.name,
    summary: "geen lid meer van de kiesploeg",
  });
  revalidatePath(ADMIN);
  revalidatePath(ADDRESSES);
  after(() => pushMailGroupsForKiesploeg(row.kiesploegId));
}

/**
 * Maakt de standaardlijsten van een kiesploeg aan: één per post, plus de g5- en
 * beheerlijst uit de sjablonen.
 *
 * De g5 wordt als **zichtbare tweede bron** aan elke postlijst gehangen, net
 * zoals Groep 5 bij het praesidium. Dat staat dus in de bronnenlijst en niet
 * als verstopte regel in de sync; wie het anders wil, verwijdert de rij.
 *
 * Bestaat een adres al, dan wordt het overgeslagen: deze knop is bedoeld om
 * twee keer te kunnen indrukken zonder brokken.
 */
export async function createKiesploegListsAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("kiesploeg.manage");
  const kiesploegId = (formData.get("kiesploegId") as string) ?? "";
  if (!kiesploegId) return saveError("INVALID_INPUT");

  const cfg = await getGoogleConfig();
  if (!cfg) return saveError("NOT_CONFIGURED");

  const kiesploeg = await prisma.kiesploeg.findUnique({
    where: { id: kiesploegId },
    select: {
      code: true,
      formalName: true,
      listTemplate: true,
      posts: { select: { id: true, code: true, name: true, isG5: true } },
    },
  });
  if (!kiesploeg) return saveError("INVALID_INPUT");

  const g5 = kiesploeg.posts.find((p) => p.isG5) ?? null;
  let created = 0;

  for (const post of kiesploeg.posts) {
    const email = renderAddress(
      kiesploeg.listTemplate,
      { code: kiesploeg.code, post: post.code },
      cfg.domain,
    );
    const existing = await prisma.mailGroup.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.mailGroup.create({
      data: {
        email,
        name: `${post.name} (${kiesploeg.formalName})`,
        description: `Automatisch aangemaakt voor ${kiesploeg.formalName}.`,
        sources: {
          create: [
            { kiesploegPostId: post.id },
            // De g5 zit in elke lijst van de ploeg, maar als zichtbare rij.
            ...(g5 && g5.id !== post.id ? [{ kiesploegPostId: g5.id }] : []),
          ],
        },
      },
    });
    created += 1;
  }

  await logAudit({
    action: "create",
    entity: "mailGroup",
    entityId: kiesploegId,
    target: kiesploeg.formalName,
    summary: `${created} groepsadressen aangemaakt voor de kiesploeg`,
  });

  revalidatePath(ADMIN);
  revalidatePath(ADDRESSES);
  return saveOk();
}
