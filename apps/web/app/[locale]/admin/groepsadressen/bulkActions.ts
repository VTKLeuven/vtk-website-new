"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { type SaveState, saveError, saveOk } from "@/lib/saveState";
import { getGoogleConfig } from "@/lib/google/config";
import { deleteGroup } from "@/lib/google/client";
import { pushMailGroup } from "@/lib/google/sync";
import {
  MAIL_GROUP_SELECT,
  type MailGroupForSync,
  loadDesiredContext,
} from "@/lib/google/desired";
import { currentAddresses, loadMailGroupActivity } from "@/lib/google/activityData";
import { type MemberStatusView, toStatusView } from "@/lib/google/activityLabels";
import { MAX_DELETE_PER_CLICK } from "@/lib/google/kinds";

/**
 * Wat het overzicht van /admin/groepsadressen in bulk doet: categorieën,
 * toewijzen aan een categorie, en groepen echt uit Google verwijderen.
 *
 * Allemaal `mailgroups.manage`: een werkgroep ziet enkel haar eigen lijsten en
 * ordent of verwijdert niets voor de hele kring.
 */

const ADMIN = "/admin/groepsadressen";

function revalidate() {
  revalidatePath(ADMIN, "layout");
}

// -----------------------------------------------------------------------------
// Categorieën
// -----------------------------------------------------------------------------

const nameSchema = z.string().trim().min(1).max(60);

export async function createCategoryAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const name = nameSchema.safeParse(formData.get("name") ?? "");
  if (!name.success) return saveError("INVALID_NAME");
  const parentId = String(formData.get("parentId") ?? "") || null;

  if (parentId) {
    const parent = await prisma.mailGroupCategory.findUnique({
      where: { id: parentId },
      select: { parentId: true },
    });
    if (!parent) return saveError("INVALID_INPUT");
    // Eén niveau diep: Praesidium › Activiteiten, niet dieper. Dieper maakt
    // van de filterrij een boom die niemand nog overziet.
    if (parent.parentId) return saveError("TOO_DEEP");
  }
  // De unieke sleutel vangt geen twee hoofdcategorieën met dezelfde naam
  // (NULL telt in Postgres niet als gelijk), dus kijk zelf.
  const clash = await prisma.mailGroupCategory.findFirst({
    where: { parentId, name: { equals: name.data, mode: "insensitive" } },
    select: { id: true },
  });
  if (clash) return saveError("DUPLICATE_CATEGORY");

  const created = await prisma.mailGroupCategory.create({
    data: { name: name.data, parentId },
    select: { id: true },
  });
  await logAudit({
    action: "create",
    entity: "mailGroupCategory",
    entityId: created.id,
    target: name.data,
  });
  revalidate();
  return saveOk();
}

export async function renameCategoryAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const id = String(formData.get("id") ?? "");
  const name = nameSchema.safeParse(formData.get("name") ?? "");
  if (!name.success) return saveError("INVALID_NAME");
  const row = await prisma.mailGroupCategory.findUnique({
    where: { id },
    select: { name: true, parentId: true },
  });
  if (!row) return saveError("INVALID_INPUT");
  const clash = await prisma.mailGroupCategory.findFirst({
    where: { parentId: row.parentId, name: { equals: name.data, mode: "insensitive" }, id: { not: id } },
    select: { id: true },
  });
  if (clash) return saveError("DUPLICATE_CATEGORY");

  await prisma.mailGroupCategory.update({ where: { id }, data: { name: name.data } });
  await logAudit({
    action: "update",
    entity: "mailGroupCategory",
    entityId: id,
    target: name.data,
    summary: row.name === name.data ? null : `hernoemd van ${row.name}`,
  });
  revalidate();
  return saveOk();
}

/**
 * Een categorie weg: haar subcategorieën gaan mee (cascade), de groepsadressen
 * blijven staan, zonder categorie.
 */
export async function deleteCategoryAction(formData: FormData): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const id = String(formData.get("id") ?? "");
  const row = await prisma.mailGroupCategory.findUnique({
    where: { id },
    select: { name: true, children: { select: { id: true } } },
  });
  if (!row) return saveError("INVALID_INPUT");
  const ids = [id, ...row.children.map((c) => c.id)];
  const loose = await prisma.mailGroup.count({ where: { categoryId: { in: ids } } });

  await prisma.mailGroupCategory.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "mailGroupCategory",
    entityId: id,
    target: row.name,
    summary: `${row.children.length} subcategorieën mee weg, ${loose} groepsadressen nu zonder categorie`,
  });
  revalidate();
  return saveOk();
}

/** Zet de aangevinkte groepsadressen in één categorie; leeg = zonder categorie. */
export async function assignCategoryAction(formData: FormData): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const ids = [...new Set(formData.getAll("id").map(String).filter(Boolean))];
  if (ids.length === 0) return saveError("NOTHING_SELECTED");
  const categoryId = String(formData.get("categoryId") ?? "") || null;

  let label = "zonder categorie";
  if (categoryId) {
    const category = await prisma.mailGroupCategory.findUnique({
      where: { id: categoryId },
      select: { name: true, parent: { select: { name: true } } },
    });
    if (!category) return saveError("INVALID_INPUT");
    label = category.parent ? `${category.parent.name} › ${category.name}` : category.name;
  }

  const result = await prisma.mailGroup.updateMany({
    where: { id: { in: ids } },
    data: { categoryId },
  });
  await logAudit({
    action: "update",
    entity: "mailGroup",
    target: label,
    summary: `${result.count} groepsadressen in ${label} gezet`,
  });
  revalidate();
  return saveOk(
    categoryId
      ? `${result.count} ${result.count === 1 ? "adres" : "adressen"} in ${label} gezet.`
      : `${result.count} ${result.count === 1 ? "adres" : "adressen"} zonder categorie gezet.`,
  );
}

/**
 * Wie mag naar de aangevinkte groepen mailen: iedereen, of enkel adressen van
 * het domein. De sync zet het in Google (`wantedGroupSettings`); de eerste
 * vijftig duwen we meteen, de rest volgt binnen de vijf minuten.
 */
export async function setExternalSendersAction(formData: FormData): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const ids = [...new Set(formData.getAll("id").map(String).filter(Boolean))];
  if (ids.length === 0) return saveError("NOTHING_SELECTED");
  const allow = formData.get("allow") === "1";
  const result = await prisma.mailGroup.updateMany({
    where: { id: { in: ids } },
    data: { allowExternalSenders: allow },
  });
  await logAudit({
    action: "update",
    entity: "mailGroup",
    target: allow ? "Mail van buiten toegelaten" : "Enkel mail van vtk.be",
    summary: `${result.count} groepsadressen: ${allow ? "iedereen mag mailen" : "enkel adressen van het domein mogen mailen"}`,
  });
  revalidate();
  after(async () => {
    for (const id of ids.slice(0, 50)) await pushMailGroup(id).catch(() => {});
  });
  return saveOk(
    allow
      ? `${result.count} ${result.count === 1 ? "adres" : "adressen"}: iedereen mag mailen.`
      : `${result.count} ${result.count === 1 ? "adres" : "adressen"}: enkel mail van vtk.be.`,
  );
}

// -----------------------------------------------------------------------------
// Verwijderen uit Google
// -----------------------------------------------------------------------------

/** Hoeveel adressen het logboek per verwijderde groep bewaart. */
const LOGGED_MEMBERS = 120;

/**
 * Verwijdert de aangevinkte groepen in Google én hun regel op de site.
 *
 * Wat weggaat: de groep in Google met haar aliassen en het archief van haar
 * berichten, de rij hier met bronnen en losse leden, en het adres als los lid
 * in andere lijsten (anders probeert de sync elke vijf minuten een groep toe te
 * voegen die niet meer bestaat). Wie erin zat, staat in het adminlogboek.
 *
 * Eén uitzondering: de jaargroep van dit of volgend werkingsjaar van een
 * hoofdgroep met een sjabloon. Die maakt de sync bij de volgende ronde gewoon
 * opnieuw aan; haal dan eerst het sjabloon weg bij de hoofdgroep.
 */
export async function deleteFromGoogleAction(formData: FormData): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const ids = [...new Set(formData.getAll("id").map(String).filter(Boolean))];
  if (ids.length === 0) return saveError("NOTHING_SELECTED");
  if (ids.length > MAX_DELETE_PER_CLICK) return saveError("TOO_MANY");
  const outcome = await deleteGroups(ids);
  if ("code" in outcome) return saveError(outcome.code);
  revalidate();
  const { deleted, problems } = outcome;
  if (problems.length) {
    return saveError(
      "PARTIAL",
      `${deleted} ${deleted === 1 ? "groep" : "groepen"} verwijderd uit Google. ${problems.join("; ")}.`,
    );
  }
  return saveOk(`${deleted} ${deleted === 1 ? "groep" : "groepen"} verwijderd uit Google.`);
}

/**
 * Dezelfde verwijdering vanaf de detailpagina van één groep. Die pagina bestaat
 * daarna niet meer, dus bij succes gaat het terug naar het overzicht.
 */
export async function deleteOneFromGoogleAction(formData: FormData): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return saveError("NOTHING_SELECTED");
  const outcome = await deleteGroups([id]);
  if ("code" in outcome) return saveError(outcome.code);
  revalidate();
  if (outcome.problems.length || outcome.deleted === 0) {
    return saveError("PARTIAL", `${outcome.problems.join("; ")}.`);
  }
  // Buiten elke try: `redirect` werkt met een throw.
  redirect(`${formData.get("locale") === "en" ? "/en" : ""}${ADMIN}`);
}

async function deleteGroups(
  ids: string[],
): Promise<{ code: string } | { deleted: number; deletedIds: string[]; problems: string[] }> {
  const cfg = await getGoogleConfig();
  if (!cfg) return { code: "NOT_CONFIGURED" };

  const year = currentWorkingYear();
  const rows = (await prisma.mailGroup.findMany({
    where: { id: { in: ids } },
    select: { ...MAIL_GROUP_SELECT, parent: { select: { yearlyTemplate: true } } },
  })) as unknown as (MailGroupForSync & { parent: { yearlyTemplate: string | null } | null })[];
  const ctx = await loadDesiredContext(rows, year);

  const recreated = rows.filter(
    (r) => r.year !== null && r.year >= year && Boolean(r.parent?.yearlyTemplate),
  );
  const todo = rows.filter((r) => !recreated.includes(r));

  const failed: string[] = [];
  const deletedIds: string[] = [];
  let deleted = 0;
  await pool(todo, 4, async (row) => {
    const members = currentAddresses(row, ctx);
    try {
      await deleteGroup(cfg, row.googleId ?? row.email);
    } catch (err) {
      failed.push(`${row.email} (${err instanceof Error ? err.message : String(err)})`);
      return;
    }
    await prisma.$transaction([
      prisma.mailGroupExtra.deleteMany({ where: { email: row.email } }),
      prisma.mailGroup.delete({ where: { id: row.id } }),
    ]);
    deleted++;
    deletedIds.push(row.id);
    const listed = members.slice(0, LOGGED_MEMBERS).join(", ");
    const rest = members.length - LOGGED_MEMBERS;
    await logAudit({
      action: "delete",
      entity: "mailGroup",
      entityId: row.id,
      target: row.email,
      summary: `uit Google verwijderd; ${members.length} leden${members.length ? `: ${listed}${rest > 0 ? ` en nog ${rest}` : ""}` : ""}`,
    });
  });

  return {
    deleted,
    deletedIds,
    problems: [
      ...failed.map((f) => `niet gelukt: ${f}`),
      ...recreated.map(
        (r) =>
          `${r.email} overgeslagen: de sync maakt die jaargroep opnieuw aan zolang de hoofdgroep een sjabloon heeft`,
      ),
    ],
  };
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await run(items[next++]);
  });
  await Promise.all(workers);
}

// -----------------------------------------------------------------------------
// Wie erin zit, zonder de pagina te verlaten
// -----------------------------------------------------------------------------

export type MemberPeek = MemberStatusView & {
  email: string;
  name: string | null;
  /** Bij een groep van de kring: haar id, om erin door te klikken. */
  groupId: string | null;
};

export async function mailGroupMembersAction(id: string): Promise<MemberPeek[] | null> {
  await requirePermission("mailgroups.manage");
  const row = (await prisma.mailGroup.findUnique({
    where: { id },
    select: MAIL_GROUP_SELECT,
  })) as unknown as MailGroupForSync | null;
  if (!row) return null;
  const ctx = await loadDesiredContext([row]);
  const activity = (await loadMailGroupActivity([row], ctx)).get(row.id);
  const members = activity?.members ?? [];
  const groupEmails = members.filter((m) => m.status.kind === "group").map((m) => m.email);
  const groups = groupEmails.length
    ? await prisma.mailGroup.findMany({ where: { email: { in: groupEmails } }, select: { id: true, email: true } })
    : [];
  const groupId = new Map(groups.map((g) => [g.email, g.id]));
  return members.map(({ email, status }) => ({
    email,
    name: "name" in status ? status.name : null,
    groupId: groupId.get(email) ?? null,
    ...toStatusView(status),
  }));
}

// -----------------------------------------------------------------------------
// Nakijkmodus
// -----------------------------------------------------------------------------

/**
 * Houden, weg, of de beslissing wissen. "Weg" verwijdert nog niets: de groep
 * komt op de lijst "Te verwijderen", die iemand daarna in één keer bevestigt.
 * Geen regel in het adminlogboek per klik (zevenhonderd regels zeggen niets);
 * de verwijdering zelf staat er wel in.
 */
export async function reviewMailGroupAction(
  id: string,
  decision: "KEEP" | "DELETE" | null,
): Promise<SaveState> {
  await requirePermission("mailgroups.manage");
  if (decision !== null && decision !== "KEEP" && decision !== "DELETE") return saveError("INVALID_INPUT");
  const result = await prisma.mailGroup.updateMany({
    where: { id },
    data: { reviewDecision: decision, reviewedAt: decision ? new Date() : null },
  });
  if (result.count === 0) return saveError("NOT_FOUND");
  revalidatePath(ADMIN);
  return saveOk();
}

export type ReviewDeleteResult =
  | { status: "error"; code: string }
  | { status: "done"; deletedIds: string[]; message: string; problems: boolean };

/**
 * Verwijdert wat in de nakijkmodus op "weg" staat. Geeft terug welke groepen
 * echt weg zijn, zodat de nakijkmodus enkel die uit haar lijst haalt; wat
 * mislukte, blijft op "weg" staan voor een volgende keer.
 */
export async function deleteReviewedAction(ids: string[]): Promise<ReviewDeleteResult> {
  await requirePermission("mailgroups.manage");
  const unique = [...new Set(ids.filter(Boolean))].slice(0, MAX_DELETE_PER_CLICK);
  if (unique.length === 0) return { status: "error", code: "NOTHING_SELECTED" };
  // Enkel wat echt op "weg" staat: een id uit een verouderd scherm verwijdert niets.
  const marked = await prisma.mailGroup.findMany({
    where: { id: { in: unique }, reviewDecision: "DELETE" },
    select: { id: true },
  });
  const outcome = await deleteGroups(marked.map((m) => m.id));
  if ("code" in outcome) return { status: "error", code: outcome.code };
  revalidate();
  const { deleted, deletedIds, problems } = outcome;
  return {
    status: "done",
    deletedIds,
    problems: problems.length > 0,
    message: `${deleted} ${deleted === 1 ? "groep" : "groepen"} verwijderd uit Google.${problems.length ? ` ${problems.join("; ")}.` : ""}`,
  };
}
