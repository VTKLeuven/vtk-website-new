"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { requireAnyPermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { currentWorkingYear } from "@/lib/workingYear";
import { logAudit } from "@/lib/audit";
import { canEditTasksOf, taskEditScope } from "@/lib/tasks/access";

/**
 * Wie doet wat: de taken van een post en wie ze dit werkingsjaar opneemt.
 * Rechten per post via `taskEditScope` (tasks.manage of tasks.manageOwn).
 *
 * Verdelen kan enkel voor het huidige werkingsjaar: een vorig jaar is historiek,
 * en de rechten van `tasks.manageOwn` gelden ook maar voor de posten van nu.
 */

const EDIT_PERMISSIONS = ["tasks.manage", "tasks.manageOwn"] as const;

function revalidate() {
  revalidatePath("/[locale]/admin/wie-doet-wat", "page");
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const taskSchema = z.object({
  id: z.string().optional(),
  groupId: z.string().min(1),
  forGroupId: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  description: optionalText(600),
  keywords: optionalText(300),
  holders: z.array(z.string().min(1)).max(40),
  backup: z.string().optional(),
});

export async function saveTaskAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireAnyPermission([...EDIT_PERMISSIONS]);
  const scope = taskEditScope(session);

  const result = taskSchema.safeParse({
    id: String(formData.get("id") ?? "") || undefined,
    groupId: String(formData.get("groupId") ?? ""),
    forGroupId: String(formData.get("forGroupId") ?? "") || undefined,
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    keywords: String(formData.get("keywords") ?? ""),
    holders: formData.getAll("holders").map(String),
    backup: String(formData.get("backup") ?? "") || undefined,
  });
  if (!result.success) return saveError("INVALID_INPUT");
  const input = result.data;

  // Een bestaande taak blijft bij haar post: haar toewijzingen hangen aan de
  // lidmaatschappen van die post, en die zijn elders niet geldig.
  const existing = input.id
    ? await prisma.groupTask.findUnique({
        where: { id: input.id },
        select: { id: true, groupId: true, name: true },
      })
    : null;
  if (input.id && !existing) return saveError("TASK_NOT_FOUND");
  const groupId = existing?.groupId ?? input.groupId;
  if (!canEditTasksOf(scope, groupId)) return saveError("TASK_FORBIDDEN");

  const post = await prisma.group.findFirst({
    where: { id: groupId, type: "PRAESIDIUM" },
    select: { id: true, nameNl: true },
  });
  if (!post) return saveError("INVALID_INPUT");

  let forGroupId: string | null = null;
  if (input.forGroupId && input.forGroupId !== groupId) {
    const target = await prisma.group.findFirst({
      where: { id: input.forGroupId, type: "PRAESIDIUM" },
      select: { id: true },
    });
    if (!target) return saveError("INVALID_INPUT");
    forGroupId = target.id;
  }

  const holders = [...new Set(input.holders)];
  const backup = input.backup ?? null;
  if (backup && holders.includes(backup)) return saveError("TASK_BACKUP_IS_HOLDER");

  // Enkel leden van deze post in dit werkingsjaar komen in aanmerking.
  const year = currentWorkingYear();
  const wanted = backup ? [...holders, backup] : holders;
  const members = await prisma.groupMembership.findMany({
    where: { id: { in: wanted }, groupId, year },
    select: { id: true, user: { select: { name: true } } },
  });
  if (members.length !== wanted.length) return saveError("TASK_INVALID_MEMBER");
  const nameOf = new Map(members.map((m) => [m.id, m.user.name]));

  const data = { name: input.name, description: input.description, keywords: input.keywords, forGroupId };
  const task = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.groupTask.update({ where: { id: existing.id }, data })
      : await tx.groupTask.create({ data: { ...data, groupId } });
    // Enkel de verdeling van dit werkingsjaar wordt vervangen; vorige jaren
    // blijven staan als historiek.
    await tx.groupTaskAssignment.deleteMany({ where: { taskId: saved.id, membership: { year } } });
    await tx.groupTaskAssignment.createMany({
      data: [
        ...holders.map((membershipId) => ({ taskId: saved.id, membershipId, kind: "HOLDER" as const })),
        ...(backup ? [{ taskId: saved.id, membershipId: backup, kind: "BACKUP" as const }] : []),
      ],
    });
    return saved;
  });

  const who = holders.map((id) => nameOf.get(id)).join(", ") || "niemand";
  await logAudit({
    action: existing ? "update" : "create",
    entity: "postTask",
    entityId: task.id,
    target: `${post.nameNl}: ${task.name}`,
    summary: `verantwoordelijk: ${who}${backup ? `; backup: ${nameOf.get(backup)}` : ""}`,
  });
  revalidate();
  return saveOk();
}

export async function deleteTaskAction(formData: FormData): Promise<SaveState> {
  const session = await requireAnyPermission([...EDIT_PERMISSIONS]);
  const id = String(formData.get("id") ?? "");
  const task = id
    ? await prisma.groupTask.findUnique({
        where: { id },
        select: { id: true, name: true, groupId: true, group: { select: { nameNl: true } } },
      })
    : null;
  if (!task) return saveError("TASK_NOT_FOUND");
  if (!canEditTasksOf(taskEditScope(session), task.groupId)) return saveError("TASK_FORBIDDEN");

  await prisma.groupTask.delete({ where: { id: task.id } });
  await logAudit({
    action: "delete",
    entity: "postTask",
    entityId: task.id,
    target: `${task.group.nameNl}: ${task.name}`,
  });
  revalidate();
  return saveOk();
}
