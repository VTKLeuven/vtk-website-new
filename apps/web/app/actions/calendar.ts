"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import { deleteObject } from "@vtk/storage";
import { requireSession } from "@/lib/session";
import { readImageField, resolveImageKey } from "@/lib/imageField";
import { saveError, type SaveState } from "@/lib/saveState";

const eventSchema = z.object({
  id: z.string().optional(),
  titleNl: z.string().min(1),
  titleEn: z.string().optional().nullable(),
  descriptionNl: z.string().optional().nullable(),
  descriptionEn: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  groupId: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  allDay: z.coerce.boolean().default(false),
  visibility: z.enum(["PUBLIC", "MEMBERS"]).default("PUBLIC"),
  url: z.string().optional().nullable(),
});

async function assertCanManageEvent(userGroups: string[], groupId: string, superOrAll: boolean) {
  if (superOrAll) return;
  if (!userGroups.includes(groupId)) {
    throw new Error("forbidden");
  }
}

export async function saveEventAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireSession();
  const parsed = eventSchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    titleNl: formData.get("titleNl"),
    titleEn: formData.get("titleEn") || null,
    descriptionNl: formData.get("descriptionNl") || null,
    descriptionEn: formData.get("descriptionEn") || null,
    location: formData.get("location") || null,
    groupId: formData.get("groupId"),
    start: formData.get("start"),
    end: formData.get("end"),
    allDay: formData.get("allDay") === "on",
    visibility: formData.get("visibility") || "PUBLIC",
    url: formData.get("url") || null,
  });
  const image = readImageField(formData);
  if (!parsed.success || image.kind === "invalid") return saveError("INVALID_INPUT");
  const input = parsed.data;

  const start = new Date(input.start);
  const end = new Date(input.end);
  // Het einde mag niet voor de start liggen. Anders is het evenement tegelijk
  // "aankomend" op de homepage (die op `start` filtert) en "verleden" in de
  // admin (die op `end` filtert): dezelfde datum, twee tegengestelde statussen.
  if (end < start) return saveError("END_BEFORE_START");

  const superOrAll =
    session.user.isSuperAdmin || hasPermission(session, "calendar.manageAll");
  if (!superOrAll && !hasPermission(session, "calendar.create")) {
    throw new Error("forbidden");
  }
  const userGroupIds = session.groups.map((g) => g.id);
  await assertCanManageEvent(userGroupIds, input.groupId, superOrAll);

  const data = {
    titleNl: input.titleNl,
    titleEn: input.titleEn,
    descriptionNl: input.descriptionNl,
    descriptionEn: input.descriptionEn,
    location: input.location,
    groupId: input.groupId,
    start,
    end,
    allDay: input.allDay,
    visibility: input.visibility,
    url: input.url,
    createdById: session.user.id,
  };

  if (input.id) {
    const existing = await prisma.calendarEvent.findUnique({ where: { id: input.id } });
    if (!existing) return saveError("INVALID_INPUT");
    await assertCanManageEvent(userGroupIds, existing.groupId, superOrAll);
    const imageKey = resolveImageKey(image, existing.imageKey);
    await prisma.calendarEvent.update({ where: { id: input.id }, data: { ...data, imageKey } });
    // De vervangen (of gewiste) afbeelding opruimen, zodat losse objecten niet
    // in de bucket blijven staan. Mislukt dat, dan is dat geen opslaanfout.
    if (existing.imageKey && existing.imageKey !== imageKey) {
      try {
        await deleteObject(existing.imageKey);
      } catch {
        /* ignore */
      }
    }
  } else {
    await prisma.calendarEvent.create({
      data: { ...data, imageKey: resolveImageKey(image, null) },
    });
  }
  revalidatePath("/kalender");
  revalidatePath("/admin/kalender");
  // De redirect naar de lijst is zelf de bevestiging; loopt via een throw en
  // hoort dus buiten elke try/catch te blijven.
  redirect("/admin/kalender");
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = formData.get("id") as string;
  if (!id) return;
  const evt = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!evt) return;
  const superOrAll =
    session.user.isSuperAdmin || hasPermission(session, "calendar.manageAll");
  const userGroupIds = session.groups.map((g) => g.id);
  await assertCanManageEvent(userGroupIds, evt.groupId, superOrAll);
  await prisma.calendarEvent.delete({ where: { id } });
  if (evt.imageKey) {
    try {
      await deleteObject(evt.imageKey);
    } catch {
      /* ignore */
    }
  }
  revalidatePath("/kalender");
  // Geen redirect: de lijst ververst ter plaatse, zodat de gekozen filter
  // (aankomend/verleden) blijft staan.
  revalidatePath("/admin/kalender");
}
