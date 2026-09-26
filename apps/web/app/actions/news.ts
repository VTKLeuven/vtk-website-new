"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { describeChanges, logAudit } from "@/lib/audit";
import { localDateTimeToUtc } from "@/lib/ticketing/time";
import { isEditableDestination } from "@/lib/href";
import { readImageField, resolveImageKey } from "@/lib/imageField";
import { NEWS_TAG } from "@/lib/news/load";
import { NEWS_AUTO_SOURCES, NEWS_COUNT_MAX, NEWS_COUNT_MIN, isNewsAutoSource } from "@/lib/news/rules";
import { NEWS_SETTING } from "@/lib/news/setting";

/**
 * Het nieuws op de homepage: de band aan of uit, de zelfgeschreven berichten,
 * en automatische berichten uit het nieuws halen. Alles onder `news.manage`.
 */

function revalidate() {
  revalidatePath("/");
  revalidatePath("/en");
  revalidatePath("/nieuws");
  revalidatePath("/en/nieuws");
  revalidatePath("/admin/nieuws");
  // De homepage leest het nieuws uit een gedeelde cache (lib/news/load.ts), en
  // `revalidatePath` raakt die niet. `updateTag` en niet `revalidateTag`: wie
  // net een bericht uitzette, hoort het meteen weg te zien, niet pas bij de
  // tweede bezoeker. Zie de uitleg in app/actions/announcements.ts.
  updateTag(NEWS_TAG);
}

/** "YYYY-MM-DDTHH:mm" uit een datetime-local-veld; leeg = geen grens. */
function parseMoment(value: string | undefined): Date | null | "invalid" {
  if (!value) return null;
  try {
    return localDateTimeToUtc(value);
  } catch {
    return "invalid";
  }
}

// ---------------------------------------------------------------------------
// De band zelf
// ---------------------------------------------------------------------------

export async function saveNewsSettingAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("news.manage");
  const count = Number(formData.get("count"));
  if (!Number.isInteger(count) || count < NEWS_COUNT_MIN || count > NEWS_COUNT_MAX) {
    return saveError("INVALID_INPUT");
  }
  const enabled = formData.get("enabled") === "on";
  const sources = Object.fromEntries(
    NEWS_AUTO_SOURCES.map((source) => [source, formData.get(`source-${source}`) === "on"]),
  );
  const value = { enabled, count, sources };

  await prisma.setting.upsert({
    where: { key: NEWS_SETTING },
    update: { value },
    create: { key: NEWS_SETTING, value },
  });
  await logAudit({
    action: "update",
    entity: "news",
    entityId: NEWS_SETTING,
    target: "Nieuws op de homepage",
    summary: `${enabled ? "aan" : "uit"}, ${count} berichten, bronnen: ${
      NEWS_AUTO_SOURCES.filter((source) => sources[source]).join(", ") || "geen"
    }`,
  });
  revalidate();
  return saveOk();
}

// ---------------------------------------------------------------------------
// Zelfgeschreven berichten
// ---------------------------------------------------------------------------

const postSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["NOTICE", "PRAESES"]),
  titleNl: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().max(200).optional(),
  bodyNl: z.string().trim().min(1),
  bodyEn: z.string().trim().optional(),
  ctaLabelNl: z.string().trim().max(60).optional(),
  ctaLabelEn: z.string().trim().max(60).optional(),
  // Een pad op deze site of een volledig adres, net als bij de aankondigingen.
  ctaUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || isEditableDestination(v), { message: "INVALID_URL" })
    .optional(),
  authorName: z.string().trim().max(100).optional(),
  authorRoleNl: z.string().trim().max(100).optional(),
  authorRoleEn: z.string().trim().max(100).optional(),
  publishedAt: z.string().optional(),
  endsAt: z.string().optional(),
  featured: z.boolean(),
  active: z.boolean(),
});

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
};

export async function saveNewsPostAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("news.manage");
  const parsed = postSchema.safeParse({
    id: text(formData, "id") || undefined,
    kind: text(formData, "kind") || "NOTICE",
    titleNl: text(formData, "titleNl") ?? "",
    titleEn: text(formData, "titleEn"),
    bodyNl: text(formData, "bodyNl") ?? "",
    bodyEn: text(formData, "bodyEn"),
    ctaLabelNl: text(formData, "ctaLabelNl"),
    ctaLabelEn: text(formData, "ctaLabelEn"),
    ctaUrl: text(formData, "ctaUrl") ?? "",
    authorName: text(formData, "authorName"),
    authorRoleNl: text(formData, "authorRoleNl"),
    authorRoleEn: text(formData, "authorRoleEn"),
    publishedAt: text(formData, "publishedAt") || undefined,
    endsAt: text(formData, "endsAt") || undefined,
    featured: formData.get("featured") === "on",
    active: formData.get("active") === "on",
  });
  const image = readImageField(formData);
  if (!parsed.success) {
    const badUrl = parsed.error.issues.some((issue) => issue.message === "INVALID_URL");
    return saveError(badUrl ? "INVALID_URL" : "INVALID_INPUT");
  }
  if (image.kind === "invalid") return saveError("INVALID_INPUT");
  const input = parsed.data;

  const publishedAt = parseMoment(input.publishedAt);
  const endsAt = parseMoment(input.endsAt);
  if (publishedAt === "invalid" || endsAt === "invalid") return saveError("INVALID_INPUT");
  // Een venster dat eindigt voor het begint, toont nooit iets: een typfout, geen
  // serverfout, dus een rode toast.
  if (endsAt && endsAt <= (publishedAt ?? new Date())) return saveError("WINDOW_INVALID");
  // Een knoptekst zonder bestemming levert een dode knop op. Een link zonder
  // tekst mag wel: dan staat er "Lees verder" op.
  if ((input.ctaLabelNl || input.ctaLabelEn) && !input.ctaUrl) return saveError("CTA_INCOMPLETE");
  // Een woordje zonder naam eronder is een anonieme brief.
  if (input.kind === "PRAESES" && !input.authorName) return saveError("AUTHOR_MISSING");

  const existing = input.id ? await prisma.newsPost.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !existing) return saveError("INVALID_INPUT");

  const data = {
    kind: input.kind,
    titleNl: input.titleNl,
    titleEn: input.titleEn || null,
    bodyNl: input.bodyNl,
    bodyEn: input.bodyEn || null,
    ctaLabelNl: input.ctaLabelNl || null,
    ctaLabelEn: input.ctaLabelEn || null,
    ctaUrl: input.ctaUrl || null,
    authorName: input.authorName || null,
    authorRoleNl: input.authorRoleNl || null,
    authorRoleEn: input.authorRoleEn || null,
    imageKey: resolveImageKey(image, existing?.imageKey ?? null),
    // Leeg bij een bestaand bericht = laat staan; bij een nieuw = nu.
    publishedAt: publishedAt ?? existing?.publishedAt ?? new Date(),
    endsAt,
    featured: input.featured,
    active: input.active,
  };

  const saved = await prisma.$transaction(async (tx) => {
    // Hoogstens één uitgelicht bericht: wie een ander aanduidt, haalt het vorige
    // er stil af in plaats van twee kaarten om dezelfde plek te laten vechten.
    if (data.featured) {
      await tx.newsPost.updateMany({
        where: { featured: true, ...(input.id ? { id: { not: input.id } } : {}) },
        data: { featured: false },
      });
    }
    return input.id
      ? tx.newsPost.update({ where: { id: input.id }, data })
      : tx.newsPost.create({ data: { ...data, createdById: session.user.id } });
  });

  await logAudit({
    action: existing ? "update" : "create",
    entity: "newsPost",
    entityId: saved.id,
    target: saved.titleNl,
    summary: existing
      ? describeChanges(existing, data, {
          kind: "soort",
          titleNl: "titel",
          titleEn: "Engelse titel",
          bodyNl: "tekst",
          bodyEn: "Engelse tekst",
          ctaLabelNl: "knoptekst",
          ctaLabelEn: "Engelse knoptekst",
          ctaUrl: "knoplink",
          authorName: "ondertekening",
          authorRoleNl: "functie",
          authorRoleEn: "Engelse functie",
          imageKey: "foto",
          publishedAt: "zichtbaar vanaf",
          endsAt: "zichtbaar tot",
          featured: "uitgelicht",
          active: "actief",
        })
      : null,
  });

  revalidate();
  return saveOk();
}

/** Aan of uit zetten zonder het formulier te openen. */
export async function setNewsPostActiveAction(formData: FormData): Promise<void> {
  await requirePermission("news.manage");
  const id = text(formData, "id");
  if (!id) return;
  const active = formData.get("active") === "1";
  const post = await prisma.newsPost.update({ where: { id }, data: { active } });
  await logAudit({
    action: "update",
    entity: "newsPost",
    entityId: id,
    target: post.titleNl,
    summary: active ? "aangezet" : "uitgezet",
  });
  revalidate();
}

export async function deleteNewsPostAction(formData: FormData): Promise<void> {
  await requirePermission("news.manage");
  const id = text(formData, "id");
  if (!id) return;
  const post = await prisma.newsPost.delete({ where: { id } });
  await logAudit({ action: "delete", entity: "newsPost", entityId: id, target: post.titleNl });
  revalidate();
}

// ---------------------------------------------------------------------------
// Automatische berichten uit het nieuws halen
// ---------------------------------------------------------------------------

/**
 * Haalt één automatisch bericht uit het nieuws, of zet het terug. De bron blijft
 * ongemoeid: de ticketverkoop loopt door, het album blijft op /media.
 */
export async function setNewsHiddenAction(formData: FormData): Promise<void> {
  await requirePermission("news.manage");
  const source = text(formData, "source") ?? "";
  const ref = text(formData, "ref") ?? "";
  const title = text(formData, "title") ?? ref;
  if (!isNewsAutoSource(source) || !ref || ref.length > 200) return;
  const hide = formData.get("hidden") === "1";

  if (hide) {
    await prisma.newsHidden.upsert({
      where: { source_ref: { source, ref } },
      update: {},
      create: { source, ref },
    });
  } else {
    await prisma.newsHidden.deleteMany({ where: { source, ref } });
  }
  await logAudit({
    action: "update",
    entity: "news",
    entityId: `${source}:${ref}`,
    target: title,
    summary: hide ? "uit het nieuws gehaald" : "terug in het nieuws gezet",
  });
  revalidate();
}
