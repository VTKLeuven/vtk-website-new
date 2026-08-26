"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import {
  createUser,
  updateUser,
} from "@vtk/auth/server";
import { hasPermission, fullName, splitFullName } from "@vtk/auth";
import { requirePermission, requireSession } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { currentWorkingYear } from "@/lib/workingYear";
import { eraseUserData } from "@/lib/privacy/account";
import { describeChanges, logAudit } from "@/lib/audit";
import { pushMailGroupsForGroup } from "@/lib/google/sync";

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
  const password = String(formData.get("password") ?? "");
  if (password && password.length < 8) return saveError("PASSWORD_TOO_SHORT");
  const result = userSchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    email: String(formData.get("email")).toLowerCase().trim(),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    password: password || undefined,
    locale: formData.get("locale") || "NL",
    active: formData.get("active") === "on",
    isSuperAdmin: formData.get("isSuperAdmin") === "on",
  });
  if (!result.success) return saveError("INVALID_INPUT");
  const parsed = result.data;
  // De weergavenaam blijft afgeleid van voor- + achternaam.
  const name = fullName(parsed.firstName, parsed.lastName);
  const rNumber = formData.has("rNumber")
    ? String(formData.get("rNumber") ?? "").trim() || null
    : undefined;

  const before = parsed.id
    ? await prisma.user.findUnique({
        where: { id: parsed.id },
        select: {
          email: true,
          name: true,
          firstName: true,
          lastName: true,
          locale: true,
          active: true,
          isSuperAdmin: true,
          rNumber: true,
        },
      })
    : null;

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
        rNumber,
        password: parsed.password,
      });
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
        rNumber,
      });
    }
  } catch (err) {
    if (isUniqueViolation(err, "email")) return saveError("EMAIL_TAKEN");
    if (isUniqueViolation(err, "rNumber")) return saveError("RNUMBER_TAKEN");
    throw err;
  }

  await logAudit({
    action: parsed.id ? "update" : "create",
    entity: "user",
    entityId: parsed.id ?? null,
    target: name,
    summary: before
      ? describeChanges(
          before,
          { ...parsed, name, rNumber: rNumber === undefined ? before.rNumber : rNumber },
          {
            email: "e-mail",
            name: "naam",
            locale: "taal",
            active: "actief",
            isSuperAdmin: "superadmin",
            rNumber: "r-nummer",
          },
        )
      : parsed.email,
  });

  revalidatePath("/admin/gebruikers");
  if (parsed.id) revalidatePath(`/admin/gebruikers/${parsed.id}`);
  // Geen redirect: het formulier staat op de lijstpagina (nieuw) of op de
  // detailpagina (bewerken); in beide gevallen blijf je waar je bent.
  return saveOk();
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const session = await requirePermission("users.edit");
  const id = formData.get("id") as string;
  if (id) {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { isSuperAdmin: true, name: true, email: true },
    });
    if (target?.isSuperAdmin && !session.user.isSuperAdmin) throw new Error("forbidden");
    await eraseUserData(id);
    await logAudit({
      action: "delete",
      entity: "user",
      entityId: id,
      target: target?.name ?? id,
      // eraseUserData laat de rij als tombstone staan; zeg dat erbij, anders
      // lijkt het logboek te beloven dat de gebruiker helemaal weg is.
      summary: "persoonsgegevens gewist; de rij blijft als geanonimiseerde tombstone bestaan",
    });
  }
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

// Lidmaatschappen beheren mag met users.edit (gebruikersbeheer). Verder hangt het
// af van het soort groep: een praesidiumpost vraagt groups.manage, een werkgroep
// vraagt werkgroepen.manage. Zo kan werkgroepbeheer los gedelegeerd worden.
// Superadmin altijd (via hasPermission).
async function requireMembershipManager(groupId: string) {
  const session = await requireSession();
  if (hasPermission(session, "users.edit")) return session;
  const group = groupId
    ? await prisma.group.findUnique({ where: { id: groupId }, select: { type: true } })
    : null;
  const needed = group?.type === "WERKGROEP" ? "werkgroepen.manage" : "groups.manage";
  if (!hasPermission(session, needed)) throw new Error("FORBIDDEN");
  return session;
}

/** Revalideert alle plekken waar een lidmaatschap zichtbaar is (post of werkgroep). */
function revalidateMembershipSurfaces(userId?: string) {
  if (userId) revalidatePath(`/admin/gebruikers/${userId}`);
  revalidatePath("/admin/groepen");
  revalidatePath("/admin/werkgroepen");
  revalidatePath("/praesidium");
  revalidatePath("/werkgroepen");
}

/**
 * Duwt een lidmaatschapswijziging meteen door naar de groepsadressen in Google
 * Workspace. Best-effort en enkel voor het huidige werkingsjaar: een vooruit
 * ingevoerde postverdeling verandert nu nog niets aan wie er in de lijst hoort,
 * en die kantelt op 15 juli vanzelf mee (zie lib/google/sync.ts).
 */
function pushGroupAddresses(groupId: string, year: number): void {
  if (year !== currentWorkingYear()) return;
  after(() => pushMailGroupsForGroup(groupId));
}

export async function addMembershipAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get("groupId") ?? "");
  await requireMembershipManager(groupId);
  const rawYear = String(formData.get("year") ?? "").trim();
  const parsed = membershipSchema.parse({
    userId: formData.get("userId"),
    groupId,
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
  const [member, group] = await Promise.all([
    prisma.user.findUnique({ where: { id: parsed.userId }, select: { name: true } }),
    prisma.group.findUnique({ where: { id: parsed.groupId }, select: { nameNl: true } }),
  ]);
  await logAudit({
    action: "create",
    entity: "membership",
    entityId: parsed.userId,
    target: member?.name ?? parsed.userId,
    summary: `${parsed.role === "LEAD" ? "verantwoordelijke" : "lid"} van ${
      group?.nameNl ?? parsed.groupId
    } in ${parsed.year}-${String(parsed.year + 1).slice(-2)}`,
  });
  revalidateMembershipSurfaces(parsed.userId);
  pushGroupAddresses(parsed.groupId, parsed.year);
}

export async function removeMembershipAction(formData: FormData): Promise<void> {
  const id = formData.get("id") as string;
  const userId = formData.get("userId") as string;
  if (id) {
    const membership = await prisma.groupMembership.findUnique({
      where: { id },
      select: {
        groupId: true,
        year: true,
        user: { select: { name: true } },
        group: { select: { nameNl: true } },
      },
    });
    if (membership) {
      await requireMembershipManager(membership.groupId);
      await prisma.groupMembership.delete({ where: { id } });
      await logAudit({
        action: "delete",
        entity: "membership",
        entityId: userId || null,
        target: membership.user.name,
        summary: `niet langer lid van ${membership.group.nameNl} in ${membership.year}-${String(
          membership.year + 1,
        ).slice(-2)}`,
      });
      pushGroupAddresses(membership.groupId, membership.year);
    }
  }
  revalidateMembershipSurfaces(userId || undefined);
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
    if (password && password.length < 8) {
      errors.push(`Line ${i + 1}: password must contain at least 8 characters`);
      continue;
    }
    // De CSV heeft één naamkolom; voor- en achternaam worden eruit afgeleid en
    // zijn achteraf te corrigeren door het lid zelf of in het gebruikersbeheer.
    const parts = splitFullName(name);
    try {
      const normalizedEmail = email.toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      const effectivePassword = password || cryptoRandomPassword();
      // Profiel, r-nummer en credential vormen één auth-transactie; een fout in
      // het wachtwoord laat zo geen half geïmporteerde gebruiker achter.
      const user = existing
        ? await updateUser(session, existing.id, {
            email: normalizedEmail,
            name,
            firstName: parts.firstName || null,
            lastName: parts.lastName || null,
            ...(rNumber ? { rNumber } : {}),
            password: effectivePassword,
          })
        : await createUser(session, {
            email: normalizedEmail,
            name,
            firstName: parts.firstName || null,
            lastName: parts.lastName || null,
            password: effectivePassword,
            locale: "NL",
            rNumber,
          });
      if (groupCode) {
        const group = groupByCode.get(groupCode.trim() as never);
        if (!group) {
          errors.push(`Line ${i + 1}: unknown group ${groupCode}`);
        } else {
          // Bewust geen push naar de groepsadressen per rij: bij een import van
          // honderd leden zouden dat honderd rondjes naar Google zijn. De
          // reconcile (elke vijf minuten) haalt het vanzelf in.
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

  await logAudit({
    action: "import",
    entity: "user",
    target: `${added} gebruiker(s)`,
    summary: `bulkimport uit CSV${errors.length ? `, ${errors.length} regel(s) met een fout` : ""}`,
  });

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

const GROUP_FIELD_LABELS: Record<string, string> = {
  nameNl: "naam",
  nameEn: "Engelse naam",
  descriptionNl: "beschrijving",
  descriptionEn: "Engelse beschrijving",
  active: "actief",
};

/**
 * Post aanmaken of bewerken. De `code` en `slug` staan enkel bij het aanmaken
 * vast (shiften en de sessie verwijzen naar `code`); bij bewerken wijzigen enkel
 * naam, beschrijving en actief-status. Een post uitzetten (active=false)
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
    active: formData.get("active") === "on",
  });
  if (!result.success) return saveError("INVALID_INPUT");
  const parsed = result.data;

  const data = {
    nameNl: parsed.nameNl,
    nameEn: parsed.nameEn,
    descriptionNl: parsed.descriptionNl,
    descriptionEn: parsed.descriptionEn,
    active: parsed.active,
  };

  try {
    if (parsed.id) {
      const existing = await prisma.group.findUnique({ where: { id: parsed.id } });
      await prisma.group.update({ where: { id: parsed.id }, data });
      await logAudit({
        action: "update",
        entity: "post",
        entityId: parsed.id,
        target: parsed.nameNl,
        summary: existing ? describeChanges(existing, data, GROUP_FIELD_LABELS) : null,
      });
    } else {
      const code = codeify(parsed.code || parsed.nameNl);
      const slug = slugify(parsed.nameNl);
      if (!code || !slug) return saveError("INVALID_INPUT");
      const last = await prisma.group.findFirst({
        where: { type: "PRAESIDIUM" },
        orderBy: { orderInPraesidium: "desc" },
        select: { orderInPraesidium: true },
      });
      const created = await prisma.group.create({
        data: {
          ...data,
          code,
          slug,
          type: "PRAESIDIUM",
          orderInPraesidium: (last?.orderInPraesidium ?? -1) + 1,
        },
      });
      await logAudit({
        action: "create",
        entity: "post",
        entityId: created.id,
        target: parsed.nameNl,
        summary: `postcode ${code}`,
      });
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

export async function reorderGroupsAction(ids: string[]): Promise<void> {
  await requirePermission("groups.manage");
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.group.update({
        where: { id },
        data: { orderInPraesidium: index },
      })
    )
  );
  await logAudit({
    action: "reorder",
    entity: "post",
    target: `${ids.length} posten`,
    summary: "volgorde van posten gewijzigd",
  });
  revalidatePath("/admin/groepen");
  revalidatePath("/praesidium");
}

/**
 * Eén logregel voor het rollenraster van een post of werkgroep. Dit geeft
 * rechten weg, dus het hoort in het logboek te staan met de rol erbij; "post
 * gewijzigd" zou hier te weinig zeggen.
 */
async function logGroupRoleChange(
  entity: "post" | "werkgroep",
  groupId: string,
  roleId: string,
  kind: "DEFAULT" | "LEADER",
  enabled: boolean,
): Promise<void> {
  const [group, role] = await Promise.all([
    prisma.group.findUnique({ where: { id: groupId }, select: { nameNl: true } }),
    prisma.role.findUnique({ where: { id: roleId }, select: { nameNl: true } }),
  ]);
  const who = kind === "LEADER" ? "de verantwoordelijke" : "elk lid";
  await logAudit({
    action: enabled ? "grant" : "revoke",
    entity,
    entityId: groupId,
    target: group?.nameNl ?? groupId,
    summary: `rol ${role?.nameNl ?? roleId} ${
      enabled ? "toegekend aan" : "afgenomen van"
    } ${who}`,
  });
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
  await logGroupRoleChange("post", groupId, roleId, kind, enabled);
  revalidatePath("/admin/groepen");
  revalidatePath("/praesidium");
}

// ---- Werkgroepen ------------------------------------------------------------
// Werkgroepen delen het Group-model met de posten, maar hebben hun eigen
// beheerrecht (werkgroepen.manage) en een eigen publieke pagina (/werkgroepen).
// De infotekst + website mag elk lid van de werkgroep zelf aanpassen; leden en
// rollen blijven voorbehouden aan werkgroepen.manage.

const werkgroepSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().optional(),
  nameNl: z.string().trim().min(1),
  nameEn: z.string().trim().min(1),
  active: z.coerce.boolean().default(true),
});

/**
 * Werkgroep aanmaken of haar basisinstellingen (naam, actief) bewerken.
 * De infotekst + website lopen apart via {@link saveWerkgroepInfoAction} zodat
 * ook gewone leden die mogen aanpassen. Enkel werkgroepen.manage (of superadmin).
 */
export async function saveWerkgroepAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("werkgroepen.manage");
  const result = werkgroepSchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    code: (formData.get("code") as string) || undefined,
    nameNl: formData.get("nameNl"),
    nameEn: formData.get("nameEn"),
    active: formData.get("active") === "on",
  });
  if (!result.success) return saveError("INVALID_INPUT");
  const parsed = result.data;

  const data = {
    nameNl: parsed.nameNl,
    nameEn: parsed.nameEn,
    active: parsed.active,
  };

  try {
    if (parsed.id) {
      const existing = await prisma.group.findUnique({ where: { id: parsed.id } });
      await prisma.group.update({ where: { id: parsed.id }, data });
      await logAudit({
        action: "update",
        entity: "werkgroep",
        entityId: parsed.id,
        target: parsed.nameNl,
        summary: existing ? describeChanges(existing, data, GROUP_FIELD_LABELS) : null,
      });
    } else {
      const code = codeify(parsed.code || parsed.nameNl);
      const slug = slugify(parsed.nameNl);
      if (!code || !slug) return saveError("INVALID_INPUT");
      const last = await prisma.group.findFirst({
        where: { type: "WERKGROEP" },
        orderBy: { orderInPraesidium: "desc" },
        select: { orderInPraesidium: true },
      });
      const created = await prisma.group.create({
        data: {
          ...data,
          code,
          slug,
          type: "WERKGROEP",
          orderInPraesidium: (last?.orderInPraesidium ?? -1) + 1,
        },
      });
      await logAudit({
        action: "create",
        entity: "werkgroep",
        entityId: created.id,
        target: parsed.nameNl,
        summary: `code ${code}`,
      });
    }
  } catch (err) {
    if (isUniqueViolation(err, "code")) return saveError("GROUP_CODE_TAKEN");
    if (isUniqueViolation(err, "slug")) return saveError("SLUG_TAKEN");
    throw err;
  }

  revalidatePath("/admin/werkgroepen");
  revalidatePath("/werkgroepen");
  return saveOk();
}

export async function reorderWerkgroepenAction(ids: string[]): Promise<void> {
  await requirePermission("werkgroepen.manage");
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.group.update({
        where: { id },
        data: { orderInPraesidium: index },
      })
    )
  );
  await logAudit({
    action: "reorder",
    entity: "werkgroep",
    target: `${ids.length} werkgroepen`,
    summary: "volgorde van werkgroepen gewijzigd",
  });
  revalidatePath("/admin/werkgroepen");
  revalidatePath("/werkgroepen");
}

const werkgroepInfoSchema = z.object({
  descriptionNl: z.string().trim().optional().nullable(),
  descriptionEn: z.string().trim().optional().nullable(),
  website: z.string().trim().optional().nullable(),
});

/**
 * Infotekst + website van een werkgroep bewerken. Toegestaan voor elk lid van
 * die werkgroep (huidig werkingsjaar) en voor werkgroepen.manage/superadmin. Een
 * lid van BEST kan dus enkel de tekst van BEST wijzigen, niet die van een andere
 * werkgroep.
 */
export async function saveWerkgroepInfoAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const group = id ? await prisma.group.findUnique({ where: { id }, select: { type: true } }) : null;
  if (!group || group.type !== "WERKGROEP") return saveError("INVALID_INPUT");

  const isMember = session.groups.some((g) => g.id === id);
  const canManage = session.user.isSuperAdmin || hasPermission(session, "werkgroepen.manage");
  if (!isMember && !canManage) return saveError("FORBIDDEN");

  const result = werkgroepInfoSchema.safeParse({
    descriptionNl: (formData.get("descriptionNl") as string) || null,
    descriptionEn: (formData.get("descriptionEn") as string) || null,
    website: (formData.get("website") as string) || null,
  });
  if (!result.success) return saveError("INVALID_INPUT");

  // Website mag zonder schema ingevuld worden (best.vtk.be); we normaliseren naar
  // een volwaardige https-URL zodat de link op /werkgroepen werkt.
  let website = result.data.website?.trim() || null;
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;

  const updated = await prisma.group.update({
    where: { id },
    data: {
      descriptionNl: result.data.descriptionNl || null,
      descriptionEn: result.data.descriptionEn || null,
      website,
    },
  });

  await logAudit({
    action: "update",
    entity: "werkgroep",
    entityId: id,
    target: updated.nameNl,
    summary: "infotekst of website bewerkt",
  });

  revalidatePath("/admin/werkgroepen");
  revalidatePath("/werkgroepen");
  return saveOk();
}

/** Zoals {@link setGroupRoleAction}, maar voor werkgroepen (werkgroepen.manage). */
export async function setWerkgroepRoleAction(formData: FormData): Promise<void> {
  await requirePermission("werkgroepen.manage");
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
  await logGroupRoleChange("werkgroep", groupId, roleId, kind, enabled);
  revalidatePath("/admin/werkgroepen");
  revalidatePath("/werkgroepen");
}
