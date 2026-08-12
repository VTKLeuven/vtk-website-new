"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { localDateTimeToUtc } from "@/lib/ticketing/time";

/**
 * Aankondigingen: het bericht dat als modal verschijnt, op de homepage of op de
 * hele site. Beheer valt onder `home.edit`, want het begon als homepage-inhoud.
 */

const schema = z.object({
  id: z.string().optional(),
  titleNl: z.string().trim().min(1),
  titleEn: z.string().trim().min(1),
  bodyNl: z.string().trim().min(1),
  bodyEn: z.string().trim().min(1),
  ctaLabelNl: z.string().trim().optional(),
  ctaLabelEn: z.string().trim().optional(),
  ctaUrl: z.string().trim().url().optional().or(z.literal("")),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  active: z.boolean(),
  scope: z.enum(["HOME", "SITE"]),
});

/** "YYYY-MM-DDTHH:mm" uit een datetime-local-veld; leeg = geen grens. */
function parseMoment(value: string | undefined): Date | null {
  if (!value) return null;
  try {
    return localDateTimeToUtc(value);
  } catch {
    return null;
  }
}

function revalidate() {
  // De modal hangt in de gedeelde layout, dus "/" alleen volstaat niet: zonder
  // het tweede argument blijft een site-brede aankondiging op elke andere route
  // onzichtbaar tot ze vanzelf verloopt.
  revalidatePath("/", "layout");
  revalidatePath("/admin/aankondigingen");
}

export async function saveAnnouncementAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("home.edit");
  const parsed = schema.safeParse({
    id: (formData.get("id") as string) || undefined,
    titleNl: formData.get("titleNl") ?? "",
    titleEn: formData.get("titleEn") ?? "",
    bodyNl: formData.get("bodyNl") ?? "",
    bodyEn: formData.get("bodyEn") ?? "",
    ctaLabelNl: (formData.get("ctaLabelNl") as string) || undefined,
    ctaLabelEn: (formData.get("ctaLabelEn") as string) || undefined,
    ctaUrl: (formData.get("ctaUrl") as string) || "",
    startsAt: (formData.get("startsAt") as string) || undefined,
    endsAt: (formData.get("endsAt") as string) || undefined,
    active: formData.get("active") === "on",
    scope: (formData.get("scope") as string) || "HOME",
  });
  if (!parsed.success) return saveError("INVALID_INPUT");

  const input = parsed.data;
  const startsAt = parseMoment(input.startsAt);
  const endsAt = parseMoment(input.endsAt);
  if ((input.startsAt && !startsAt) || (input.endsAt && !endsAt)) {
    return saveError("INVALID_INPUT");
  }
  // Een venster dat eindigt voor het begint toont nooit iets; dat is een typfout,
  // geen serverfout, dus het komt als rode toast terug.
  if (startsAt && endsAt && endsAt <= startsAt) return saveError("WINDOW_INVALID");
  // Een knoptekst zonder bestemming (of omgekeerd) levert een dode knop op.
  const hasLabel = Boolean(input.ctaLabelNl || input.ctaLabelEn);
  if (hasLabel !== Boolean(input.ctaUrl)) return saveError("CTA_INCOMPLETE");

  const data = {
    titleNl: input.titleNl,
    titleEn: input.titleEn,
    bodyNl: input.bodyNl,
    bodyEn: input.bodyEn,
    ctaLabelNl: input.ctaLabelNl || null,
    ctaLabelEn: input.ctaLabelEn || null,
    ctaUrl: input.ctaUrl || null,
    startsAt,
    endsAt,
    active: input.active,
    scope: input.scope,
  };

  if (input.id) {
    await prisma.announcement.update({ where: { id: input.id }, data });
  } else {
    await prisma.announcement.create({ data: { ...data, createdById: session.user.id } });
  }

  revalidate();
  return saveOk();
}

/** Aan/uit zetten zonder het formulier te openen. */
export async function setAnnouncementActiveAction(formData: FormData): Promise<void> {
  await requirePermission("home.edit");
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.announcement.update({
    where: { id },
    data: { active: formData.get("active") === "1" },
  });
  revalidate();
}

export async function deleteAnnouncementAction(formData: FormData): Promise<void> {
  await requirePermission("home.edit");
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.announcement.delete({ where: { id } });
  revalidate();
}
