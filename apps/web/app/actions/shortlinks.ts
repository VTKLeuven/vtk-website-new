"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";

const shortLinkSchema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/, {
      message: "Alleen letters, cijfers, '.', '_' en '-' toegestaan",
    }),
  url: z.string().url(),
  note: z.string().optional().nullable(),
  enabled: z.coerce.boolean().default(true),
  expiresAt: z.date().nullable(),
});

// A date-only input ("YYYY-MM-DD") means "expires at the end of that day".
// Store it as end-of-day UTC so it round-trips cleanly (toISOString().slice(0,10)
// yields the same date back in the form) and is unambiguous across timezones.
function parseExpiry(raw: string | null): Date | null {
  const value = raw?.trim();
  if (!value) return null;
  const d = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function saveShortLinkAction(formData: FormData): Promise<void> {
  const session = await requirePermission("shortlinks.manage");
  const parsed = shortLinkSchema.parse({
    id: (formData.get("id") as string) || undefined,
    slug: (formData.get("slug") as string)?.trim(),
    url: (formData.get("url") as string)?.trim(),
    note: (formData.get("note") as string)?.trim() || null,
    enabled: formData.get("enabled") === "on",
    expiresAt: parseExpiry(formData.get("expiresAt") as string | null),
  });

  const data = {
    slug: parsed.slug,
    url: parsed.url,
    note: parsed.note,
    enabled: parsed.enabled,
    expiresAt: parsed.expiresAt,
  };

  if (parsed.id) {
    await prisma.shortLink.update({ where: { id: parsed.id }, data });
  } else {
    await prisma.shortLink.create({
      data: { ...data, createdById: session.user.id },
    });
  }

  revalidatePath("/admin/links");
  redirect("/admin/links");
}

export async function deleteShortLinkAction(formData: FormData): Promise<void> {
  await requirePermission("shortlinks.manage");
  const id = formData.get("id") as string;
  if (id) await prisma.shortLink.delete({ where: { id } });
  revalidatePath("/admin/links");
  redirect("/admin/links");
}
