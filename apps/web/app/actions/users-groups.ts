"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import {
  createUser,
  deleteUser,
  setUserPassword,
  updateUser,
} from "@vtk/auth/server";
import { hasPermission, fullName, splitFullName } from "@vtk/auth";
import { requirePermission, requireSession } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { currentWorkingYear } from "@/lib/workingYear";

/** `P2002` op een bepaald veld: de unieke constraint die Prisma noemt. */
function isUniqueViolation(err: unknown, field: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    String(err.meta?.target ?? "").includes(field)
  );
}

// ---- Users ------------------------------------------------------------------

const userSchema = z.object({
  id: z.string().optional(),
  email: z.string().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  password: z.string().optional(),
  locale: z.enum(["NL", "EN"]).default("NL"),
  active: z.coerce.boolean().default(true),
  isSuperAdmin: z.coerce.boolean().default(false),
});

export async function saveUserAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission("users.edit");
  const result = userSchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    email: String(formData.get("email")).toLowerCase().trim(),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    password: formData.get("password") || undefined,
    locale: formData.get("locale") || "NL",
    active: formData.get("active") === "on",
    isSuperAdmin: formData.get("isSuperAdmin") === "on",
  });
  if (!result.success) return saveError("INVALID_INPUT");
  const parsed = result.data;
  // De weergavenaam blijft afgeleid van voor- + achternaam.
  const name = fullName(parsed.firstName, parsed.lastName);

  try {
    if (parsed.id) {
      await updateUser(session, parsed.id, {
        email: parsed.email,
        name,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        locale: parsed.locale,
        active: parsed.active,
        isSuperAdmin: parsed.isSuperAdmin,
      });
      if (parsed.password && parsed.password.length > 0) {
        await setUserPassword(session, parsed.id, parsed.password);
      }
    } else {
      if (!parsed.password) return saveError("PASSWORD_REQUIRED");
      await createUser(session, {
        email: parsed.email,
        name,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        password: parsed.password,
        locale: parsed.locale,
        active: parsed.active,
        isSuperAdmin: parsed.isSuperAdmin,
      });
    }

    // rNumber zit niet in createUser/updateUser; enkel bijwerken wanneer het veld
    // effectief in het formulier zat (lege waarde = wissen).
    if (formData.has("rNumber")) {
      const rNumber = String(formData.get("rNumber") ?? "").trim() || null;
      await prisma.user.update({ where: { email: parsed.email }, data: { rNumber } });
    }
  } catch (err) {
    if (isUniqueViolation(err, "email")) return saveError("EMAIL_TAKEN");
    if (isUniqueViolation(err, "rNumber")) return saveError("RNUMBER_TAKEN");
    throw err;
  }

  revalidatePath("/admin/gebruikers");
  if (parsed.id) revalidatePath(`/admin/gebruikers/${parsed.id}`);
  // Geen redirect: het formulier staat op de lijstpagina (nieuw) of op de
  // detailpagina (bewerken); in beide gevallen blijf je waar je bent.
  return saveOk();
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const session = await requirePermission("users.edit");
  const id = formData.get("id") as string;
  if (id) await deleteUser(session, id);
  revalidatePath("/admin/gebruikers");
  redirect("/admin/gebruikers");
}

const membershipSchema = z.object({
  userId: z.string().min(1),
  groupId: z.string().min(1),
  role: z.enum(["MEMBER", "LEAD"]).default("MEMBER"),
  titleNl: z.string().optional().nullable(),
  titleEn: z.string().optional().nullable(),
  year: z.coerce.number().int(),
});

// Lidmaatschappen beheren mag met users.edit (gebruikersbeheer) of met
// groups.manage (postenbeheer). Superadmin altijd.
async function requireMembershipManager() {
  const session = await requireSession();
  if (!hasPermission(session, "users.edit") && !hasPermission(session, "groups.manage")) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

export async function addMembershipAction(formData: FormData): Promise<void> {
  await requireMembershipManager();
  const rawYear = String(formData.get("year") ?? "").trim();
  const parsed = membershipSchema.parse({
    userId: formData.get("userId"),
    groupId: formData.get("groupId"),
    role: formData.get("role") || "MEMBER",
    titleNl: formData.get("titleNl") || null,
    titleEn: formData.get("titleEn") || null,
    // Leeg jaar valt terug op het huidige werkingsjaar.
    year: rawYear || currentWorkingYear(),
  });
  await prisma.groupMembership.upsert({
    where: {
      userId_groupId_year: {
        userId: parsed.userId,
        groupId: parsed.groupId,
        year: parsed.year,
      },
    },
    update: { role: parsed.role, titleNl: parsed.titleNl, titleEn: parsed.titleEn },
    create: parsed,
  });
  revalidatePath(`/admin/gebruikers/${parsed.userId}`);
  revalidatePath("/admin/groepen");
  revalidatePath("/praesidium");
}

export async function removeMembershipAction(formData: FormData): Promise<void> {
  await requireMembershipManager();
  const id = formData.get("id") as string;
  const userId = formData.get("userId") as string;
  if (id) await prisma.groupMembership.delete({ where: { id } });
  if (userId) revalidatePath(`/admin/gebruikers/${userId}`);
  revalidatePath("/admin/groepen");
  revalidatePath("/praesidium");
}

// Bulk CSV import. Columns: email,name,password,groupCode,role,year,rNumber
export async function bulkImportUsersAction(formData: FormData): Promise<{ ok: boolean; added: number; errors: string[] }> {
  await requirePermission("users.bulkImport");
  const session = await requireSession();
  const csv = (formData.get("csv") as string) || "";
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errors: string[] = [];
  let added = 0;

  const groups = await prisma.group.findMany();
  const groupByCode = new Map(groups.map((g) => [g.code, g]));

  // Skip header row if present
  const start = lines[0]?.toLowerCase().includes("email") ? 1 : 0;

  for (let i = start; i < lines.length; i += 1) {
    const cols = splitCsv(lines[i]);
    const [email, name, password, groupCode, role, yearStr, rNumberRaw] = cols;
    if (!email || !name) {
      errors.push(`Line ${i + 1}: missing email/name`);
      continue;
    }
    const rNumber = rNumberRaw?.trim() || undefined;
    // De CSV heeft één naamkolom; voor- en achternaam worden eruit afgeleid en
    // zijn achteraf te corrigeren door het lid zelf of in het gebruikersbeheer.
    const parts = splitFullName(name);
    try {
      const user = await prisma.user.upsert({
        where: { email: email.toLowerCase() },
        // rNumber enkel meenemen wanneer de kolom een waarde heeft (niet wissen).
        update: {
          name,
          firstName: parts.firstName || null,
          lastName: parts.lastName || null,
          ...(rNumber ? { rNumber } : {}),
        },
        create: {
          email: email.toLowerCase(),
          name,
          firstName: parts.firstName || null,
          lastName: parts.lastName || null,
          ...(rNumber ? { rNumber } : {}),
        },
      });
      await setUserPassword(session, user.id, password || cryptoRandomPassword());
      if (groupCode) {
        const group = groupByCode.get(groupCode.trim() as never);
        if (!group) {
          errors.push(`Line ${i + 1}: unknown group ${groupCode}`);
        } else {
          // Leeg jaar in de CSV valt terug op het huidige werkingsjaar.
          const membershipYear = yearStr ? Number(yearStr) : currentWorkingYear();
          const membershipRole = (role?.toUpperCase() === "LEAD" ? "LEAD" : "MEMBER") as
            | "LEAD"
            | "MEMBER";
          await prisma.groupMembership.upsert({
            where: {
              userId_groupId_year: {
                userId: user.id,
                groupId: group.id,
                year: membershipYear,
              },
            },
            update: { role: membershipRole },
            create: {
              userId: user.id,
              groupId: group.id,
              role: membershipRole,
              year: membershipYear,
            },
          });
        }
      }
      added += 1;
    } catch (err) {
      errors.push(`Line ${i + 1}: ${(err as Error).message}`);
    }
  }

  revalidatePath("/admin/gebruikers");
  return { ok: errors.length === 0, added, errors };
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function cryptoRandomPassword() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

// ---- Groups -----------------------------------------------------------------

export async function setGroupPermissionAction(formData: FormData): Promise<void> {
  await requirePermission("groups.manage");
  const groupId = formData.get("groupId") as string;
  const permissionId = formData.get("permissionId") as string;
  const enabled = formData.get("enabled") === "1";
  if (!groupId || !permissionId) return;
  if (enabled) {
    await prisma.groupPermission.upsert({
      where: { groupId_permissionId: { groupId, permissionId } },
      update: {},
      create: { groupId, permissionId },
    });
  } else {
    await prisma.groupPermission
      .delete({ where: { groupId_permissionId: { groupId, permissionId } } })
      .catch(() => null);
  }
  revalidatePath("/admin/groepen");
}

export async function saveGroupAction(formData: FormData): Promise<void> {
  await requirePermission("groups.manage");
  const id = formData.get("id") as string;
  const nameNl = formData.get("nameNl") as string;
  const nameEn = formData.get("nameEn") as string;
  const descriptionNl = formData.get("descriptionNl") as string;
  const descriptionEn = formData.get("descriptionEn") as string;
  const orderInPraesidium = Number(formData.get("orderInPraesidium")) || 0;
  await prisma.group.update({
    where: { id },
    data: { nameNl, nameEn, descriptionNl, descriptionEn, orderInPraesidium },
  });
  revalidatePath("/admin/groepen");
  revalidatePath("/praesidium");
}
