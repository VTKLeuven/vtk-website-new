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

// ---- Groups (posten) --------------------------------------------------------

/** Slug uit een naam: kleine letters, koppeltekens, enkel [a-z0-9-]. */
function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Postcode uit een naam: hoofdletters, underscores, enkel [A-Z0-9_] (zoals IT, GROEP5). */
function codeify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const groupSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().optional(),
  nameNl: z.string().trim().min(1),
  nameEn: z.string().trim().min(1),
  descriptionNl: z.string().trim().optional().nullable(),
  descriptionEn: z.string().trim().optional().nullable(),
  orderInPraesidium: z.coerce.number().int().default(0),
  active: z.coerce.boolean().default(true),
});

/**
 * Post aanmaken of bewerken. De `code` en `slug` staan enkel bij het aanmaken
 * vast (shiften en de sessie verwijzen naar `code`); bij bewerken wijzigen enkel
 * naam, beschrijving, volgorde en actief-status. Een post uitzetten (active=false)
 * haalt ze uit de nieuwe-shift-keuzes maar behoudt de historiek.
 */
export async function saveGroupAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("groups.manage");
  const result = groupSchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    code: (formData.get("code") as string) || undefined,
    nameNl: formData.get("nameNl"),
    nameEn: formData.get("nameEn"),
    descriptionNl: (formData.get("descriptionNl") as string) || null,
    descriptionEn: (formData.get("descriptionEn") as string) || null,
    orderInPraesidium: formData.get("orderInPraesidium") || 0,
    active: formData.get("active") === "on",
  });
  if (!result.success) return saveError("INVALID_INPUT");
  const parsed = result.data;

  const data = {
    nameNl: parsed.nameNl,
    nameEn: parsed.nameEn,
    descriptionNl: parsed.descriptionNl,
    descriptionEn: parsed.descriptionEn,
    orderInPraesidium: parsed.orderInPraesidium,
    active: parsed.active,
  };

  try {
    if (parsed.id) {
      await prisma.group.update({ where: { id: parsed.id }, data });
    } else {
      const code = codeify(parsed.code || parsed.nameNl);
      const slug = slugify(parsed.nameNl);
      if (!code || !slug) return saveError("INVALID_INPUT");
      await prisma.group.create({ data: { ...data, code, slug } });
    }
  } catch (err) {
    if (isUniqueViolation(err, "code")) return saveError("GROUP_CODE_TAKEN");
    if (isUniqueViolation(err, "slug")) return saveError("SLUG_TAKEN");
    throw err;
  }

  revalidatePath("/admin/groepen");
  revalidatePath("/praesidium");
  return saveOk();
}

/**
 * Zet (of haalt weg) een rol-grant van een post: een post kent haar rollen toe
 * aan elk lid (DEFAULT) of enkel aan de verantwoordelijke (LEADER). Vervangt het
 * oude "recht per post"-raster: posten verlenen nu rollen, geen losse rechten.
 */
export async function setGroupRoleAction(formData: FormData): Promise<void> {
  await requirePermission("groups.manage");
  const groupId = formData.get("groupId") as string;
  const roleId = formData.get("roleId") as string;
  const kind = formData.get("kind") === "LEADER" ? "LEADER" : "DEFAULT";
  const enabled = formData.get("enabled") === "1";
  if (!groupId || !roleId) return;
  if (enabled) {
    await prisma.groupRole.upsert({
      where: { groupId_roleId_kind: { groupId, roleId, kind } },
      update: {},
      create: { groupId, roleId, kind },
    });
  } else {
    await prisma.groupRole
      .delete({ where: { groupId_roleId_kind: { groupId, roleId, kind } } })
      .catch(() => null);
  }
  revalidatePath("/admin/groepen");
  revalidatePath("/praesidium");
}
