"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { slugify } from "@vtk/db/slug";
import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { requirePermission } from "@/lib/session";
import { parseTemplateEntries } from "@/lib/shift/templates";

/**
 * Het beheer van de shiftsjablonen: de reeks shiften die een terugkerend
 * evenement telkens nodig heeft.
 *
 * De shiftrijen komen als JSON in één verborgen veld binnen, zoals bij de
 * slogans. Elke rij heeft elf velden waarvan er drie een keuze zijn en twee een
 * vinkje, en dat in genummerde formuliervelden persen levert enkel een tweede,
 * afwijkende lezing van hetzelfde op.
 *
 * Een sjabloon aanpassen raakt geen enkele bestaande shift: wat al aangemaakt
 * is, staat los in `Shift`. Het raakt wél elke reeks die iemand hierna neerzet,
 * en `theokot` bemant automatisch elke verkoopdag; daarom hangt dit aan een
 * eigen recht (`shift.templates`) en niet aan `shift.edit`.
 */

/** Wie welke posten op een sjabloon mag zetten. */
async function allowedPosts(
  session: Awaited<ReturnType<typeof requirePermission>>,
  templateId: string | null,
): Promise<string[]> {
  const active = await prisma.group.findMany({
    where: { active: true, type: "PRAESIDIUM" },
    orderBy: { orderInPraesidium: "asc" },
    select: { code: true },
  });
  if (session.user.isSuperAdmin) return active.map((g) => g.code);

  const own = new Set(session.groups.filter((g) => g.type === "PRAESIDIUM").map((g) => g.code));

  // De posten die dit sjabloon al gebruikt tellen mee, ook als ze niet van jou
  // zijn. Anders zou wie de cantusreeks komt bijstellen de post ACTIVITEITEN
  // stilletjes leegmaken omdat ze niet in zijn keuzelijst stond.
  if (templateId) {
    const existing = await prisma.shiftTemplate.findUnique({
      where: { id: templateId },
      select: { post: true, shifts: { select: { post: true } } },
    });
    if (existing?.post) own.add(existing.post);
    for (const shift of existing?.shifts ?? []) if (shift.post) own.add(shift.post);
  }

  return active.map((g) => g.code).filter((code) => own.has(code));
}

const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value.trim() : "");

/** "HH:mm" of leeg; alles anders is geen uur. */
const timeOfDay = (value: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null);

/** Een vrije slug die nog niet bestaat: `cantus`, dan `cantus-2`, ... */
async function freeSlug(label: string): Promise<string> {
  const base = slugify(label) || "sjabloon";
  for (let n = 1; n < 100; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await prisma.shiftTemplate.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function revalidateTemplates() {
  revalidatePath("/admin/shiften/sjablonen");
  revalidatePath("/admin/shiften/sjablonen/beheer");
}

export async function saveShiftTemplateAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission("shift.templates");

  const templateId = text(formData.get("templateId")) || null;
  const label = text(formData.get("label"));
  if (label === "") return saveError("LABEL_REQUIRED");

  const posts = await allowedPosts(session, templateId);
  const post = text(formData.get("post"));
  if (post !== "" && !posts.includes(post)) return saveError("FORBIDDEN_POST");

  let payload: unknown;
  try {
    payload = JSON.parse(text(formData.get("shiftsData")) || "null");
  } catch {
    return saveError("INVALID_INPUT");
  }

  const entries = parseTemplateEntries(payload, posts);
  if (typeof entries === "string") return saveError("INVALID_SHIFT", `Niet opgeslagen. ${entries}`);
  // Een sjabloon zonder shiften zet niets neer en staat enkel in de weg in de
  // keuzelijst van het sjabloonscherm.
  if (entries.length === 0) return saveError("NO_SHIFTS");

  const data = {
    label,
    note: text(formData.get("note")) || null,
    eventName: text(formData.get("eventName")),
    location: text(formData.get("location")),
    post: post === "" ? null : post,
    timeOfDay: timeOfDay(text(formData.get("timeOfDay"))),
  };

  const shifts = {
    create: entries.map((entry, order) => ({ ...entry, order })),
  };

  if (templateId) {
    const existing = await prisma.shiftTemplate.findUnique({ where: { id: templateId }, select: { id: true } });
    if (!existing) return saveError("TEMPLATE_GONE");

    // De shiften worden vervangen, niet bijgewerkt: rijen kunnen verdwenen,
    // bijgekomen en van plaats gewisseld zijn, en niets buiten dit sjabloon
    // verwijst naar zo'n rij. Eén transactie, zodat een fout halverwege geen
    // sjabloon zonder shiften achterlaat.
    await prisma.$transaction([
      prisma.shiftTemplateEntry.deleteMany({ where: { templateId } }),
      prisma.shiftTemplate.update({ where: { id: templateId }, data: { ...data, shifts } }),
    ]);

    await logAudit({
      action: "update",
      entity: "shiftTemplate",
      entityId: templateId,
      target: label,
      summary: `${entries.length} shift(en)`,
    });
    revalidateTemplates();
    return saveOk();
  }

  const created = await prisma.shiftTemplate.create({
    data: {
      ...data,
      slug: await freeSlug(label),
      // Nieuw sjabloon: mag verwijderd worden. `builtIn` is enkel voor wat uit
      // de seed komt en waar code aan hangt.
      builtIn: false,
      order: await prisma.shiftTemplate.count(),
      shifts,
    },
    select: { id: true },
  });

  await logAudit({
    action: "create",
    entity: "shiftTemplate",
    entityId: created.id,
    target: label,
    summary: `${entries.length} shift(en)`,
  });
  revalidateTemplates();
  return saveOk();
}

export async function deleteShiftTemplateAction(formData: FormData): Promise<void> {
  await requirePermission("shift.templates");
  const id = text(formData.get("templateId"));
  if (!id) return;

  const template = await prisma.shiftTemplate.findUnique({
    where: { id },
    select: { id: true, label: true, builtIn: true },
  });
  // Een meegeleverd sjabloon verdwijnt niet: `theokot` bemant elke verkoopdag,
  // en die dagen zouden er stil zonder shiften bij komen te staan. Bewerken mag.
  if (!template || template.builtIn) return;

  await prisma.shiftTemplate.delete({ where: { id } });
  await logAudit({ action: "delete", entity: "shiftTemplate", entityId: id, target: template.label });
  revalidateTemplates();
}
