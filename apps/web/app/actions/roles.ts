"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { setRoleClientPermission } from "@vtk/auth/server";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { currentWorkingYear } from "@/lib/workingYear";

/** `P2002` op `code`: de rolcode is al in gebruik. */
function isCodeTaken(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    String(err.meta?.target ?? "").includes("code")
  );
}

/** Slug uit een naam: kleine letters, koppeltekens, enkel [a-z0-9-]. */
function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combineerbare accenten weghalen
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const roleSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().optional(),
  nameNl: z.string().trim().min(1),
  nameEn: z.string().trim().min(1),
  descriptionNl: z.string().trim().optional().nullable(),
  descriptionEn: z.string().trim().optional().nullable(),
  color: z.string().trim().optional().nullable(),
  order: z.coerce.number().int().default(0),
});

export async function saveRoleAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("roles.manage");
  const result = roleSchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    code: (formData.get("code") as string) || undefined,
    nameNl: formData.get("nameNl"),
    nameEn: formData.get("nameEn"),
    descriptionNl: (formData.get("descriptionNl") as string) || null,
    descriptionEn: (formData.get("descriptionEn") as string) || null,
    color: (formData.get("color") as string) || null,
    order: formData.get("order") || 0,
  });
  if (!result.success) return saveError("INVALID_INPUT");
  const parsed = result.data;
  // Lege code valt terug op een slug van de Nederlandse naam.
  const code = slugify(parsed.code || parsed.nameNl);
  if (!code) return saveError("INVALID_INPUT");

  const data = {
    nameNl: parsed.nameNl,
    nameEn: parsed.nameEn,
    descriptionNl: parsed.descriptionNl,
    descriptionEn: parsed.descriptionEn,
    color: parsed.color,
    order: parsed.order,
  };

  try {
    if (parsed.id) {
      // De code van een systeemrol (bv. admin) blijft vast; enkel labels wijzigen.
      const existing = await prisma.role.findUnique({ where: { id: parsed.id } });
      if (!existing) return saveError("INVALID_INPUT");
      await prisma.role.update({
        where: { id: parsed.id },
        data: existing.system ? data : { ...data, code },
      });
    } else {
      await prisma.role.create({ data: { ...data, code } });
    }
  } catch (err) {
    if (isCodeTaken(err)) return saveError("ROLE_CODE_TAKEN");
    throw err;
  }

  revalidatePath("/admin/roles");
  return saveOk();
}

export async function deleteRoleAction(formData: FormData): Promise<void> {
  await requirePermission("roles.manage");
  const id = formData.get("id") as string;
  if (!id) return;
  const role = await prisma.role.findUnique({ where: { id } });
  // Systeemrollen zijn niet verwijderbaar via de GUI.
  if (!role || role.system) return;
  await prisma.role.delete({ where: { id } });
  revalidatePath("/admin/roles");
}

export async function setRolePermissionAction(formData: FormData): Promise<void> {
  await requirePermission("roles.manage");
  const roleId = formData.get("roleId") as string;
  const permissionId = formData.get("permissionId") as string;
  const enabled = formData.get("enabled") === "1";
  if (!roleId || !permissionId) return;
  if (enabled) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: {},
      create: { roleId, permissionId },
    });
  } else {
    await prisma.rolePermission
      .delete({ where: { roleId_permissionId: { roleId, permissionId } } })
      .catch(() => null);
  }
  revalidatePath("/admin/roles");
}

/**
 * Zelfde als hierboven, maar voor een permissie van een externe applicatie
 * (SSO). Het vocabulaire zelf wordt beheerd op /admin/sso; hier wordt een
 * bestaande code enkel aan een rol gehangen, zodat wie rollen beheert ook
 * toegang tot de externe apps kan regelen zonder OAuth-beheerder te zijn.
 *
 * De regels (en het intrekken van tokens bij uitzetten) zitten in
 * packages/auth/src/server/clientPermissionsAdmin.ts.
 */
export async function setRoleClientPermissionAction(formData: FormData): Promise<void> {
  await requirePermission("roles.manage");
  const roleId = formData.get("roleId") as string;
  const permissionId = formData.get("permissionId") as string;
  const enabled = formData.get("enabled") === "1";
  if (!roleId || !permissionId) return;

  await setRoleClientPermission(await headers(), roleId, permissionId, enabled);
  revalidatePath("/admin/roles");
  revalidatePath("/admin/sso");
}

// ---- Roltoewijzing aan gebruikers -------------------------------------------
// Toewijzingen gelden voor het huidige werkingsjaar (de 15-juli-reset). We
// vertrouwen het jaar niet vanuit de client: de server bepaalt het.

const assignSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
});

export async function assignUserRoleAction(formData: FormData): Promise<void> {
  await requirePermission("roles.manage");
  const parsed = assignSchema.safeParse({
    userId: formData.get("userId"),
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) return;
  const year = currentWorkingYear();
  await prisma.userRole.upsert({
    where: {
      userId_roleId_year: { userId: parsed.data.userId, roleId: parsed.data.roleId, year },
    },
    update: {},
    create: { userId: parsed.data.userId, roleId: parsed.data.roleId, year },
  });
  revalidatePath("/admin/roles");
  revalidatePath(`/admin/gebruikers/${parsed.data.userId}`);
}

export async function removeUserRoleAction(formData: FormData): Promise<void> {
  await requirePermission("roles.manage");
  const userId = formData.get("userId") as string;
  const roleId = formData.get("roleId") as string;
  const year = Number(formData.get("year")) || currentWorkingYear();
  if (!userId || !roleId) return;
  await prisma.userRole
    .delete({ where: { userId_roleId_year: { userId, roleId, year } } })
    .catch(() => null);
  revalidatePath("/admin/roles");
  revalidatePath(`/admin/gebruikers/${userId}`);
}
