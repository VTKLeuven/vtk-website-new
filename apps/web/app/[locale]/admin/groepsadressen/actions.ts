"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, searchUsers } from "@vtk/db";
import { cachedDirectory } from "@/lib/google/directoryCache";
import { currentWorkingYear } from "@vtk/auth";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { type SaveState, saveError, saveOk } from "@/lib/saveState";
import { getGoogleConfig, getGoogleStatus } from "@/lib/google/config";
import { collectLinkCandidates } from "@/lib/google/link";
import { mailGroupAccess, requireMailGroupEditor } from "@/lib/google/access";
import { normaliseNamePart, renderAddress, yearVars } from "@/lib/google/addresses";
import { everyGroupOfKindLabel, isGroupKind, normaliseEmail, type GroupKind } from "@/lib/google/members";
import { pushMailGroup, reconcileGoogle } from "@/lib/google/sync";
import { IMPORTED_NOTE, type ImportOutcome, importGoogleGroup } from "@/lib/google/import";

/**
 * Server actions van de groepsadressen (Google Workspace).
 *
 * Drie dingen die overal terugkomen:
 *
 * - **Verwachte fouten komen terug, ze worden niet gegooid** (zie CLAUDE.md).
 *   Een adres dat al bestaat of een onbereikbaar Google hoort een rode toast te
 *   geven, geen error boundary.
 * - **Wie mag wat** staat in `lib/google/access.ts`: `mailgroups.manage` alles,
 *   een werkgroep enkel de leden van haar eigen lijsten.
 * - **Een wijziging aan wie erin zit, duwt meteen naar Google** (in `after()`,
 *   zodat niemand op Google wacht). De reconcile haalt een hapering in.
 */

const ADMIN = "/admin/groepsadressen";

function fields(formData: FormData) {
  return Object.fromEntries(formData.entries()) as Record<string, string>;
}

function revalidate(mailGroupId?: string) {
  revalidatePath(ADMIN);
  if (mailGroupId) revalidatePath(`${ADMIN}/${mailGroupId}`);
}

const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "geen geldig adres");

/**
 * Gooit enkel bij een onbekende lijst of een sessie zonder recht: dat is geen
 * invoerfout maar een knop die er niet had mogen staan.
 */
async function editor(mailGroupId: string) {
  return requireMailGroupEditor(mailGroupId);
}

// -----------------------------------------------------------------------------
// Een groepsadres aanmaken, instellen, loskoppelen
// -----------------------------------------------------------------------------

const createSchema = z.object({
  email: z.string().trim().optional(),
  localPart: z.string().trim().max(60).optional(),
  ownerGroupId: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  allowExternalSenders: z.string().optional(),
  categoryId: z.string().optional(),
  locale: z.string().optional(),
});

/**
 * Een nieuw groepsadres, meteen met categorie, bronnen en leden: wie een adres
 * maakt, weet meestal al wie erin moet, en hoefde het vroeger eerst leeg aan te
 * maken om dat daarna op de detailpagina te doen.
 *
 * Bronnen komen als `source` (`group:<id>`, eventueel met `|lead` voor enkel
 * de verantwoordelijke), leden als `member` (`site:<id>`, `gw:<adres>`,
 * `address:<adres>`, zoals het gecombineerde zoekveld). Beide enkel voor
 * `mailgroups.manage`; een werkgroep zet haar leden er daarna in.
 */
export async function createMailGroupAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const access = await mailGroupAccess();
  const parsed = createSchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_INPUT");
  const input = parsed.data;
  const ownerGroupId = input.ownerGroupId || null;

  if (!access.manageAll && (!ownerGroupId || !access.werkgroepIds.has(ownerGroupId))) {
    throw new Error("FORBIDDEN");
  }

  const owner = ownerGroupId
    ? await prisma.group.findUnique({
        where: { id: ownerGroupId },
        select: { mailPrefix: true, type: true },
      })
    : null;
  if (ownerGroupId && !owner) return saveError("INVALID_INPUT");

  let email: string;
  if (!access.manageAll) {
    // Een werkgroep kiest enkel wat er na haar voorvoegsel komt.
    const domain = (await getGoogleStatus()).domain ?? "vtk.be";
    const local = (input.localPart ?? "")
      .toLowerCase()
      .split(".")
      .map(normaliseNamePart)
      .filter(Boolean)
      .join(".");
    if (!local || !owner?.mailPrefix) return saveError("INVALID_EMAIL");
    email = `${owner.mailPrefix}.${local}@${domain}`;
  } else {
    const parsedEmail = emailSchema.safeParse(input.email ?? "");
    if (!parsedEmail.success) return saveError("INVALID_EMAIL");
    email = normaliseEmail(parsedEmail.data);
  }

  const clash = await prisma.mailGroup.findUnique({ where: { email }, select: { id: true } });
  if (clash) return saveError("DUPLICATE_EMAIL");

  // Wat er meteen in moet; enkel voor wie alles beheert.
  const sources: { kind: SourceKind; id: string; onlyLead: boolean }[] = [];
  const members: { userId?: string; email?: string; note?: string }[] = [];
  let categoryId: string | null = null;
  if (access.manageAll) {
    if (input.categoryId) {
      const category = await prisma.mailGroupCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } });
      if (!category) return saveError("INVALID_INPUT");
      categoryId = category.id;
    }
    for (const raw of formData.getAll("source").map(String)) {
      const [key, flag] = raw.split("|");
      const source = parseSource(key);
      if (!source || !(await sourceLabel(source.kind, source.id))) return saveError("INVALID_INPUT");
      const onlyLead = flag === "lead";
      if (!sources.some((x) => x.kind === source.kind && x.id === source.id && x.onlyLead === onlyLead)) {
        sources.push({ ...source, onlyLead });
      }
    }
    const seen = new Set<string>();
    for (const raw of formData.getAll("member").map(String)) {
      const [kind, ...rest] = raw.split(":");
      const value = rest.join(":");
      if (seen.has(raw) || !value) continue;
      seen.add(raw);
      if (kind === "site") {
        const user = await prisma.user.findUnique({ where: { id: value }, select: { id: true } });
        if (!user) return saveError("INVALID_INPUT");
        members.push({ userId: user.id });
      } else if (kind === "gw" || kind === "address") {
        const parsedMember = emailSchema.safeParse(value);
        if (!parsedMember.success) return saveError("INVALID_EMAIL");
        if (members.some((m) => m.email === normaliseEmail(parsedMember.data))) continue;
        members.push({
          email: normaliseEmail(parsedMember.data),
          note: kind === "gw" ? "account van Google Workspace" : undefined,
        });
      } else {
        return saveError("INVALID_INPUT");
      }
    }
  }

  const created = await prisma.mailGroup.create({
    data: {
      email,
      name: input.name,
      description: input.description || null,
      allowExternalSenders: input.allowExternalSenders === "on",
      ownerGroupId,
      categoryId,
      sources: {
        create: sources.map((source) => ({
          onlyLead: source.onlyLead,
          groupId: source.kind === "group" ? source.id : null,
          groupType: source.kind === "type" ? (source.id as GroupKind) : null,
          kiesploegId: source.kind === "kiesploeg" ? source.id : null,
          kiesploegPostId: source.kind === "kiesploegPost" ? source.id : null,
          pocId: source.kind === "poc" ? source.id : null,
        })),
      },
      extras: {
        create: members.map((m) => ({
          kind: "INCLUDE" as const,
          userId: m.userId ?? null,
          email: m.email ?? null,
          note: m.note ?? null,
        })),
      },
    },
    select: { id: true },
  });
  await logAudit({
    action: "create",
    entity: "mailGroup",
    entityId: created.id,
    target: email,
    summary:
      sources.length || members.length
        ? `groepsadres toegevoegd, met ${sources.length} ${sources.length === 1 ? "bron" : "bronnen"} en ${members.length} ${members.length === 1 ? "lid" : "leden"}`
        : "groepsadres toegevoegd",
  });

  revalidate();
  if (sources.length || members.length) after(() => pushMailGroup(created.id));
  // De detailpagina openen is zelf de bevestiging; buiten elke try/catch.
  redirect(`${input.locale === "en" ? "/en" : ""}${ADMIN}/${created.id}`);
}

const settingsSchema = z.object({
  id: z.string().min(1),
  email: z.string().trim().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  allowExternalSenders: z.string().optional(),
  ownerGroupId: z.string().optional(),
  enabled: z.string().optional(),
  categoryId: z.string().optional(),
});

/**
 * Naam en omschrijving mag de werkgroep zelf aanpassen. Het adres, wie het
 * beheert en of de site het nog beheert, enkel `mailgroups.manage`: een
 * werkgroep die haar adres hernoemt, neemt het adres op affiches mee.
 */
export async function saveMailGroupAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const parsed = settingsSchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_INPUT");
  const input = parsed.data;
  const { access, mailGroup } = await editor(input.id);

  const data: {
    name: string;
    description: string | null;
    email?: string;
    allowExternalSenders?: boolean;
    ownerGroupId?: string | null;
    enabled?: boolean;
    categoryId?: string | null;
  } = { name: input.name, description: input.description || null };

  if (access.manageAll) {
    const parsedEmail = emailSchema.safeParse(input.email ?? "");
    if (!parsedEmail.success) return saveError("INVALID_EMAIL");
    const email = normaliseEmail(parsedEmail.data);
    const clash = await prisma.mailGroup.findUnique({ where: { email }, select: { id: true } });
    if (clash && clash.id !== input.id) return saveError("DUPLICATE_EMAIL");
    data.email = email;
    // Een checkbox stuurt niets mee wanneer ze uit staat.
    data.allowExternalSenders = input.allowExternalSenders === "on";
    data.ownerGroupId = input.ownerGroupId || null;
    data.enabled = input.enabled === "on";
    // Enkel wanneer het formulier het veld meestuurt: een ouder formulier zonder
    // categorie mag een gekozen categorie niet stil wissen.
    if (input.categoryId !== undefined) {
      const categoryId = input.categoryId || null;
      if (categoryId && !(await prisma.mailGroupCategory.findUnique({ where: { id: categoryId }, select: { id: true } }))) {
        return saveError("INVALID_INPUT");
      }
      data.categoryId = categoryId;
    }
  }

  await prisma.mailGroup.update({ where: { id: input.id }, data });
  await logAudit({
    action: "update",
    entity: "mailGroup",
    entityId: input.id,
    target: data.email ?? mailGroup.email,
    summary: "groepsadres bijgewerkt",
  });

  revalidate(input.id);
  after(() => pushMailGroup(input.id));
  return saveOk();
}

export async function deleteMailGroupAction(formData: FormData): Promise<void> {
  await requirePermission("mailgroups.manage");
  const id = (formData.get("id") as string) ?? "";
  if (!id) return;

  const row = await prisma.mailGroup.findUnique({ where: { id }, select: { email: true } });
  if (!row) return;

  // Enkel onze regel verdwijnt. De groep in Google blijft bestaan: daar hangt
  // het archief aan en het adres staat op affiches en in mailhandtekeningen.
  await prisma.mailGroup.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "mailGroup",
    entityId: id,
    target: row.email,
    summary: "koppeling verwijderd; de groep in Google blijft bestaan",
  });
  revalidate();
  const locale = formData.get("locale");
  redirect(`${locale === "en" ? "/en" : ""}${ADMIN}`);
}

// -----------------------------------------------------------------------------
// Bronnen
// -----------------------------------------------------------------------------

const sourceSchema = z.object({
  mailGroupId: z.string().min(1),
  /** `group:<id>`, `type:<GroupKind>`, `kiesploeg:<id>`, `kiesploegPost:<id>` of `poc:<id>`. */
  source: z.string().min(3),
  onlyLead: z.string().optional(),
});

type SourceKind = "group" | "type" | "kiesploeg" | "kiesploegPost" | "poc";

/** Splitst de gecombineerde keuzelijst in het juiste kolomveld. */
function parseSource(raw: string): { kind: SourceKind; id: string } | null {
  const [kind, id] = raw.split(":");
  if (!id) return null;
  if (kind === "type") return isGroupKind(id) ? { kind, id } : null;
  if (kind !== "group" && kind !== "kiesploeg" && kind !== "kiesploegPost" && kind !== "poc") {
    return null;
  }
  return { kind, id };
}

/** Hoe de bron heet, voor het logboek. */
async function sourceLabel(kind: SourceKind, id: string): Promise<string | null> {
  if (kind === "type") {
    return isGroupKind(id) ? everyGroupOfKindLabel(id, true).toLowerCase() : null;
  }
  if (kind === "group") {
    return (await prisma.group.findUnique({ where: { id }, select: { nameNl: true } }))?.nameNl ?? null;
  }
  if (kind === "poc") {
    const row = await prisma.poc.findUnique({ where: { id }, select: { nameNl: true } });
    return row ? `POC ${row.nameNl}` : null;
  }
  if (kind === "kiesploeg") {
    const row = await prisma.kiesploeg.findUnique({ where: { id }, select: { formalName: true } });
    return row?.formalName ?? null;
  }
  const row = await prisma.kiesploegPost.findUnique({
    where: { id },
    select: { name: true, kiesploeg: { select: { formalName: true } } },
  });
  return row ? `${row.name} (${row.kiesploeg.formalName})` : null;
}

/**
 * Een bron toevoegen. Een werkgroep mag enkel haar eigen werkgroep als bron
 * zetten ("iedereen van Statix"); posten, kiesploegen en POC's zijn voor
 * `mailgroups.manage`.
 */
export async function addSourceAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const parsed = sourceSchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_INPUT");
  const { mailGroupId } = parsed.data;
  const { access, mailGroup } = await editor(mailGroupId);
  const onlyLead = parsed.data.onlyLead === "on";
  const source = parseSource(parsed.data.source);
  if (!source) return saveError("INVALID_INPUT");
  if (!access.manageAll && !(source.kind === "group" && source.id === mailGroup.ownerGroupId)) {
    throw new Error("FORBIDDEN");
  }

  const label = await sourceLabel(source.kind, source.id);
  if (!label) return saveError("INVALID_INPUT");

  const columns = {
    groupId: source.kind === "group" ? source.id : null,
    groupType: source.kind === "type" ? (source.id as GroupKind) : null,
    kiesploegId: source.kind === "kiesploeg" ? source.id : null,
    kiesploegPostId: source.kind === "kiesploegPost" ? source.id : null,
    pocId: source.kind === "poc" ? source.id : null,
  };

  const existing = await prisma.mailGroupSource.findFirst({
    where: { mailGroupId, onlyLead, ...columns },
    select: { id: true },
  });
  if (existing) return saveError("DUPLICATE_SOURCE");

  await prisma.mailGroupSource.create({ data: { mailGroupId, onlyLead, ...columns } });
  await logAudit({
    action: "update",
    entity: "mailGroup",
    entityId: mailGroupId,
    target: mailGroup.email,
    summary: `bron toegevoegd: ${label}${onlyLead ? " (enkel de verantwoordelijke)" : ""}`,
  });

  revalidate(mailGroupId);
  after(() => pushMailGroup(mailGroupId));
  return saveOk();
}

export async function removeSourceAction(formData: FormData): Promise<void> {
  const id = (formData.get("id") as string) ?? "";
  if (!id) return;

  const row = await prisma.mailGroupSource.findUnique({
    where: { id },
    select: {
      groupId: true,
      groupType: true,
      mailGroupId: true,
      group: { select: { nameNl: true } },
      kiesploeg: { select: { formalName: true } },
      kiesploegPost: { select: { name: true } },
      poc: { select: { nameNl: true } },
    },
  });
  if (!row) return;
  const { access, mailGroup } = await editor(row.mailGroupId);
  if (!access.manageAll && row.groupId !== mailGroup.ownerGroupId) throw new Error("FORBIDDEN");

  const label =
    row.group?.nameNl ??
    (row.groupType ? everyGroupOfKindLabel(row.groupType, true).toLowerCase() : null) ??
    row.kiesploeg?.formalName ??
    row.kiesploegPost?.name ??
    (row.poc ? `POC ${row.poc.nameNl}` : null) ??
    "bron";

  await prisma.mailGroupSource.delete({ where: { id } });
  await logAudit({
    action: "update",
    entity: "mailGroup",
    entityId: row.mailGroupId,
    target: mailGroup.email,
    summary: `bron verwijderd: ${label}`,
  });
  revalidate(row.mailGroupId);
  after(() => pushMailGroup(row.mailGroupId));
}

// -----------------------------------------------------------------------------
// Losse leden: een lid van de site of een vrij adres
// -----------------------------------------------------------------------------

const extraSchema = z.object({
  mailGroupId: z.string().min(1),
  email: emailSchema,
  kind: z.enum(["INCLUDE", "EXCLUDE"]),
  note: z.string().trim().max(200).optional(),
});

export async function addExtraAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const parsed = extraSchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_EMAIL");
  const { mailGroupId, kind } = parsed.data;
  const { mailGroup } = await editor(mailGroupId);
  const email = normaliseEmail(parsed.data.email);

  const existing = await prisma.mailGroupExtra.findUnique({
    where: { mailGroupId_email: { mailGroupId, email } },
    select: { id: true },
  });
  if (existing) return saveError("DUPLICATE_EMAIL");

  await prisma.mailGroupExtra.create({
    data: { mailGroupId, email, kind, note: parsed.data.note || null },
  });
  await logAudit({
    action: "update",
    entity: "mailGroup",
    entityId: mailGroupId,
    target: mailGroup.email,
    summary: `${kind === "INCLUDE" ? "extra adres" : "uitsluiting"} toegevoegd: ${email}`,
  });

  revalidate(mailGroupId);
  after(() => pushMailGroup(mailGroupId));
  return saveOk();
}

const userMemberSchema = z.object({
  mailGroupId: z.string().min(1),
  userId: z.string().min(1),
  kind: z.enum(["INCLUDE", "EXCLUDE"]).default("INCLUDE"),
});

/**
 * Zet een lid van de site in de lijst. Het adres volgt dan zijn account: in
 * een lijst van zijn werkgroep zijn werkgroepadres, anders zijn persoonlijke.
 *
 * Een werkgroep kiest enkel uit haar eigen leden van dit werkingsjaar; een vrij
 * adres kan ze nog altijd als los adres toevoegen.
 */
export async function addUserMemberAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const parsed = userMemberSchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_INPUT");
  const { mailGroupId, userId, kind } = parsed.data;
  const { access, mailGroup } = await editor(mailGroupId);

  if (!access.manageAll) {
    const isMember = await prisma.groupMembership.count({
      where: { userId, groupId: mailGroup.ownerGroupId ?? "", year: currentWorkingYear() },
    });
    if (!isMember) return saveError("NOT_IN_WERKGROEP");
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) return saveError("INVALID_INPUT");

  const existing = await prisma.mailGroupExtra.findUnique({
    where: { mailGroupId_userId: { mailGroupId, userId } },
    select: { id: true },
  });
  if (existing) return saveError("DUPLICATE_MEMBER");

  await prisma.mailGroupExtra.create({ data: { mailGroupId, userId, kind } });
  await logAudit({
    action: "update",
    entity: "mailGroup",
    entityId: mailGroupId,
    target: mailGroup.email,
    summary: `${kind === "INCLUDE" ? "lid toegevoegd" : "lid uitgesloten"}: ${user.name}`,
  });

  revalidate(mailGroupId);
  after(() => pushMailGroup(mailGroupId));
  return saveOk();
}

export async function removeExtraAction(formData: FormData): Promise<void> {
  const id = (formData.get("id") as string) ?? "";
  if (!id) return;

  const row = await prisma.mailGroupExtra.findUnique({
    where: { id },
    select: { email: true, mailGroupId: true, user: { select: { name: true } } },
  });
  if (!row) return;
  const { mailGroup } = await editor(row.mailGroupId);

  await prisma.mailGroupExtra.delete({ where: { id } });
  await logAudit({
    action: "update",
    entity: "mailGroup",
    entityId: row.mailGroupId,
    target: mailGroup.email,
    summary: `uit de lijst gehaald: ${row.user?.name ?? row.email}`,
  });
  revalidate(row.mailGroupId);
  after(() => pushMailGroup(row.mailGroupId));
}

/**
 * Wist de losse adressen die bij het overnemen uit Google meekwamen, nadat de
 * lijst een bron kreeg die hetzelfde doet. Bewust een aparte, bevestigde stap:
 * overnemen kopieert wat er in Google stond, en pas wie de bron nakeek, weet
 * dat die adressen dubbel zijn.
 */
export async function clearImportedExtrasAction(formData: FormData): Promise<void> {
  await requirePermission("mailgroups.manage");
  const mailGroupId = (formData.get("mailGroupId") as string) ?? "";
  const mailGroup = await prisma.mailGroup.findUnique({
    where: { id: mailGroupId },
    select: { email: true },
  });
  if (!mailGroup) return;
  const { count } = await prisma.mailGroupExtra.deleteMany({
    where: { mailGroupId, kind: "INCLUDE", note: IMPORTED_NOTE, userId: null },
  });
  await logAudit({
    action: "update",
    entity: "mailGroup",
    entityId: mailGroupId,
    target: mailGroup.email,
    summary: `${count} overgenomen adressen gewist`,
  });
  revalidate(mailGroupId);
  after(() => pushMailGroup(mailGroupId));
}


// -----------------------------------------------------------------------------
// Jaargroepen
// -----------------------------------------------------------------------------

const yearlySchema = z.object({
  mailGroupId: z.string().min(1),
  yearlyTemplate: z.string().trim().max(80).optional(),
  yearlyGroupId: z.string().optional(),
});

/**
 * Stelt de jaargroepen van een hoofdgroep in (activiteiten_{jj} uit post
 * Activiteiten).
 *
 * Wat er al stond, wordt opgeruimd en niet verdubbeld: een overgenomen
 * jaargroep (activiteiten_2526) krijgt deze groep als ouder en haar jaar, zodat
 * ze archief wordt; en de jaargroepen die als los adres in de hoofdgroep
 * stonden, verdwijnen daar, want de sync hangt vanaf nu zelf de juiste erin.
 */
export async function saveYearlyAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const parsed = yearlySchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_INPUT");
  const { mailGroupId } = parsed.data;
  const template = parsed.data.yearlyTemplate?.toLowerCase() || null;
  const groupId = parsed.data.yearlyGroupId || null;
  if (Boolean(template) !== Boolean(groupId)) return saveError("YEARLY_INCOMPLETE");
  if (template && !/\{(jj|jaar)\}/.test(template)) return saveError("YEARLY_NO_YEAR");
  if (template && template.includes("@")) return saveError("YEARLY_NO_DOMAIN");

  const mailGroup = await prisma.mailGroup.findUnique({
    where: { id: mailGroupId },
    select: { email: true, year: true },
  });
  if (!mailGroup) return saveError("INVALID_INPUT");
  if (mailGroup.year !== null) return saveError("YEARLY_ON_YEARLY");

  await prisma.mailGroup.update({
    where: { id: mailGroupId },
    data: { yearlyTemplate: template, yearlyGroupId: groupId },
  });

  let linked = 0;
  if (template) {
    const domain = (await getGoogleStatus()).domain ?? "vtk.be";
    const current = currentWorkingYear();
    // Tien jaar terug volstaat ruim voor wat er nog in Google staat.
    for (let y = current - 10; y <= current + 1; y += 1) {
      const email = renderAddress(template, yearVars(y), domain);
      await prisma.mailGroupExtra.deleteMany({
        where: { mailGroupId, email, kind: "INCLUDE" },
      });
      const existing = await prisma.mailGroup.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existing && existing.id !== mailGroupId) {
        await prisma.mailGroup.update({
          where: { id: existing.id },
          data: { parentId: mailGroupId, year: y },
        });
        linked += 1;
      }
    }
  }

  await logAudit({
    action: "update",
    entity: "mailGroup",
    entityId: mailGroupId,
    target: mailGroup.email,
    summary: template
      ? `jaargroepen ingesteld: ${template} (${linked} bestaande jaargroepen gekoppeld)`
      : "jaargroepen uitgezet",
  });

  revalidate(mailGroupId);
  return saveOk();
}

// -----------------------------------------------------------------------------
// Overnemen uit Google
// -----------------------------------------------------------------------------

export type ImportState =
  | { status: "idle" }
  | { status: "error"; code: string; nonce: number }
  | { status: "done"; results: ImportOutcome[]; nonce: number };

/**
 * Neemt de aangevinkte Google-groepen over. Zie `lib/google/import.ts`: er
 * verandert niets in Google, de huidige leden komen mee als losse leden.
 */
export async function importGroupsAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requirePermission("mailgroups.manage");
  const emails = [...new Set(formData.getAll("email").map(String).filter(Boolean))];
  if (emails.length === 0) return { status: "error", code: "NOTHING_SELECTED", nonce: Date.now() };
  const cfg = await getGoogleConfig();
  if (!cfg) return { status: "error", code: "NOT_CONFIGURED", nonce: Date.now() };

  const results: ImportOutcome[] = [];
  for (const email of emails) results.push(await importGoogleGroup(cfg, email));

  revalidatePath(ADMIN, "layout");
  return { status: "done", results, nonce: Date.now() };
}

export async function syncMailGroupsAction(): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const result = await reconcileGoogle();
  if ("skipped" in result) return saveError("NOT_CONFIGURED");

  await logAudit({
    action: "sync",
    entity: "mailGroup",
    target: "Groepsadressen",
    summary: `${result.groups} lijsten, ${result.added} toegevoegd, ${result.removed} verwijderd, ${result.accountsChanged} accounts aangepast`,
  });
  revalidatePath(ADMIN, "layout");
  if (result.failed > 0) return saveError("SYNC_PARTIAL");
  return saveOk();
}

// -----------------------------------------------------------------------------
// Koppelen van @vtk.be-accounts aan leden
// -----------------------------------------------------------------------------

const linkSchema = z.object({
  userId: z.string().min(1),
  googleUserId: z.string().min(1),
  googleEmail: emailSchema,
});

/**
 * Koppelt één Google-account aan één lid. Het adres moet op het beheerde domein
 * staan: een privé-Gmail koppelen zou interne post naar buiten sturen zonder dat
 * iemand die keuze bewust maakte.
 */
export async function linkGoogleAccountAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const parsed = linkSchema.safeParse(fields(formData));
  if (!parsed.success) return saveError("INVALID_INPUT");
  const googleEmail = normaliseEmail(parsed.data.googleEmail);

  const cfg = await getGoogleConfig();
  if (!cfg) return saveError("NOT_CONFIGURED");
  if (!googleEmail.endsWith(`@${cfg.domain}`)) return saveError("WRONG_DOMAIN");

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { name: true },
  });
  if (!user) return saveError("INVALID_INPUT");

  const taken = await prisma.user.findFirst({
    where: {
      id: { not: parsed.data.userId },
      OR: [{ googleUserId: parsed.data.googleUserId }, { googleEmail }],
    },
    select: { name: true },
  });
  if (taken) return saveError("ALREADY_LINKED");

  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: {
      googleUserId: parsed.data.googleUserId,
      googleEmail,
      googleLinkedAt: new Date(),
    },
  });
  await logAudit({
    action: "update",
    entity: "user",
    entityId: parsed.data.userId,
    target: user.name,
    summary: `gekoppeld aan het Google-account ${googleEmail}`,
  });

  revalidatePath(ADMIN);
  revalidatePath(`${ADMIN}/koppelingen`);
  return saveOk();
}

/**
 * Koppelt in één keer alle eenduidige voorstellen.
 *
 * Herberekent ze server-side in plaats van de paren uit het formulier te
 * gebruiken: een lijst die de browser meestuurt, is een lijst die de browser kan
 * wijzigen. Twijfelgevallen (naamgenoten) zitten per definitie niet in de
 * voorstellen en blijven dus handwerk.
 */
export async function linkAllSuggestionsAction(): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const cfg = await getGoogleConfig();
  if (!cfg) return saveError("NOT_CONFIGURED");

  let candidates;
  try {
    candidates = await collectLinkCandidates(cfg);
  } catch {
    return saveError("GOOGLE_UNREACHABLE");
  }
  if (candidates.matches.length === 0) return saveOk();

  const now = new Date();
  let linked = 0;
  for (const match of candidates.matches) {
    try {
      await prisma.user.update({
        where: { id: match.userId },
        data: {
          googleUserId: match.googleUserId,
          googleEmail: normaliseEmail(match.googleEmail),
          googleLinkedAt: now,
        },
      });
      linked += 1;
    } catch {
      // Een unieke-sleutelbotsing betekent dat iemand anders dat account
      // ondertussen kreeg. De rest van de voorstellen mag gewoon doorgaan.
    }
  }

  await logAudit({
    action: "update",
    entity: "user",
    target: "Google-koppelingen",
    summary: `${linked} leden gekoppeld aan hun @vtk.be-account`,
  });

  revalidatePath(ADMIN);
  revalidatePath(`${ADMIN}/koppelingen`);
  return saveOk();
}

export async function unlinkGoogleAccountAction(formData: FormData): Promise<void> {
  await requirePermission("mailgroups.manage");
  const userId = (formData.get("userId") as string) ?? "";
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, googleEmail: true },
  });
  if (!user) return;

  await prisma.user.update({
    where: { id: userId },
    data: { googleUserId: null, googleEmail: null, googleLinkedAt: null },
  });
  await logAudit({
    action: "update",
    entity: "user",
    entityId: userId,
    target: user.name,
    summary: `koppeling met ${user.googleEmail ?? "Google"} verwijderd`,
  });

  revalidatePath(ADMIN);
  revalidatePath(`${ADMIN}/koppelingen`);
}

// -----------------------------------------------------------------------------
// Eén zoekveld voor leden van de site en accounts van Google Workspace
// -----------------------------------------------------------------------------

export type MemberCandidate =
  | {
      source: "site";
      userId: string;
      name: string;
      /** Het adres waarmee het lid op de site staat. */
      siteEmail: string;
      /** Het gekoppelde @vtk.be-account; dat komt in de lijst. `null` = geen. */
      vtk: string | null;
    }
  | { source: "gw"; email: string; name: string | null; suspended: boolean }
  | { source: "address"; email: string };

function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Zoekt tegelijk in de leden van de site en in de accounts van het domein. Een
 * account dat aan een lid gekoppeld is, komt één keer terug, als lid: kies je
 * dat, dan volgt het adres zijn account. Een getypt mailadres dat nergens bij
 * past, kan je als vrij adres toevoegen.
 */
export async function searchMemberCandidatesAction(
  mailGroupId: string,
  query: string,
): Promise<MemberCandidate[]> {
  const { access } = await editor(mailGroupId);
  if (!access.manageAll) return [];
  return findMemberCandidates(query);
}

/** Hetzelfde zoekveld op "Nieuw groepsadres", voor er een lijst is. */
export async function searchNewMemberCandidatesAction(query: string): Promise<MemberCandidate[]> {
  const access = await mailGroupAccess();
  if (!access.manageAll) return [];
  return findMemberCandidates(query);
}

async function findMemberCandidates(query: string): Promise<MemberCandidate[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const words = fold(q).split(/\s+/).filter(Boolean);

  const cfg = await getGoogleConfig();
  const [siteHits, directory] = await Promise.all([
    searchUsers(q, { limit: 8, db: prisma }),
    cfg ? cachedDirectory(cfg).catch(() => []) : Promise.resolve([]),
  ]);
  const gwHits = directory
    .filter((u) => words.every((w) => fold(`${u.primaryEmail} ${u.name?.fullName ?? ""}`).includes(w)))
    .slice(0, 12);

  // Welke van die accounts hangen aan een lid? Die tonen we als lid.
  const linkedUsers = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        { id: { in: siteHits.map((u) => u.id) } },
        { googleEmail: { in: gwHits.map((u) => u.primaryEmail.toLowerCase()) } },
      ],
    },
    select: { id: true, name: true, email: true, googleEmail: true },
  });
  const userById = new Map(linkedUsers.map((u) => [u.id, u]));
  const userByVtk = new Map(linkedUsers.filter((u) => u.googleEmail).map((u) => [u.googleEmail as string, u]));

  const out: MemberCandidate[] = [];
  const seenUsers = new Set<string>();
  for (const hit of siteHits) {
    const user = userById.get(hit.id);
    if (!user || seenUsers.has(user.id)) continue;
    seenUsers.add(user.id);
    out.push({ source: "site", userId: user.id, name: user.name, siteEmail: user.email, vtk: user.googleEmail });
  }
  for (const account of gwHits) {
    const email = account.primaryEmail.toLowerCase();
    const user = userByVtk.get(email);
    if (user) {
      if (seenUsers.has(user.id)) continue;
      seenUsers.add(user.id);
      out.push({ source: "site", userId: user.id, name: user.name, siteEmail: user.email, vtk: user.googleEmail });
      continue;
    }
    out.push({ source: "gw", email, name: account.name?.fullName ?? null, suspended: Boolean(account.suspended) });
  }
  const typed = q.toLowerCase();
  if (emailSchema.safeParse(typed).success && !out.some((c) => ("email" in c && c.email === typed) || (c.source === "site" && c.vtk === typed))) {
    out.push({ source: "address", email: typed });
  }
  return out;
}

/**
 * Voegt toe wat in het gecombineerde zoekveld gekozen werd: een lid van de site
 * (`site:<id>`), een account van Google Workspace of een vrij adres
 * (`gw:<adres>`, `address:<adres>`). Hetzelfde als de twee losse acties.
 */
export async function addMemberAction(prev: SaveState, formData: FormData): Promise<SaveState> {
  const choice = String(formData.get("choice") ?? "");
  const [source, ...rest] = choice.split(":");
  const value = rest.join(":");
  if (!value) return saveError("NOTHING_CHOSEN");
  const forward = new FormData();
  forward.set("mailGroupId", String(formData.get("mailGroupId") ?? ""));
  forward.set("kind", String(formData.get("kind") ?? "INCLUDE"));
  if (source === "site") {
    forward.set("userId", value);
    return addUserMemberAction(prev, forward);
  }
  if (source === "gw" || source === "address") {
    forward.set("email", value);
    forward.set("note", source === "gw" ? "account van Google Workspace" : "");
    return addExtraAction(prev, forward);
  }
  return saveError("INVALID_INPUT");
}
