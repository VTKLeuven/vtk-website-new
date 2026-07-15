"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import { requireSession } from "@/lib/session";

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

export async function saveEventAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = eventSchema.parse({
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

  const superOrAll =
    session.user.isSuperAdmin || hasPermission(session, "calendar.manageAll");
  if (!superOrAll && !hasPermission(session, "calendar.create")) {
    throw new Error("forbidden");
  }
  const userGroupIds = session.groups.map((g) => g.id);
  await assertCanManageEvent(userGroupIds, parsed.groupId, superOrAll);

  const data = {
    titleNl: parsed.titleNl,
    titleEn: parsed.titleEn,
    descriptionNl: parsed.descriptionNl,
    descriptionEn: parsed.descriptionEn,
    location: parsed.location,
    groupId: parsed.groupId,
    start: new Date(parsed.start),
    end: new Date(parsed.end),
    allDay: parsed.allDay,
    visibility: parsed.visibility,
    url: parsed.url,
    createdById: session.user.id,
  };

  if (parsed.id) {
    const existing = await prisma.calendarEvent.findUnique({ where: { id: parsed.id } });
    if (!existing) return;
    await assertCanManageEvent(userGroupIds, existing.groupId, superOrAll);
    await prisma.calendarEvent.update({ where: { id: parsed.id }, data });
  } else {
    await prisma.calendarEvent.create({ data });
  }
  revalidatePath("/kalender");
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
  revalidatePath("/kalender");
  // Geen redirect: de lijst ververst ter plaatse, zodat de gekozen filter
  // (aankomend/verleden) blijft staan.
  revalidatePath("/admin/kalender");
}
