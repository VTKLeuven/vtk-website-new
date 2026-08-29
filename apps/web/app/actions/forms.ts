"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { SessionPayload } from "@vtk/auth";
import { requireSession } from "@/lib/session";
import { canCreateFormForGroup, requireFormCapability } from "@/lib/forms/authorization";
import { checkPageForForm, refreshFormPage } from "@/lib/forms/pageLink";
import { logFormAudit } from "@/lib/forms/audit";
import { slugify } from "@/lib/ticketing/slug";
import { localDateTimeToUtc } from "@/lib/ticketing/time";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { logAudit } from "@/lib/audit";

const localeSchema = z.enum(["nl", "en"]);
const statusSchema = z.enum(["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"]);
const audienceSchema = z.enum(["PUBLIC", "MEMBERS"]);
const localeModeSchema = z.enum(["BOTH", "NL_ONLY", "EN_ONLY"]);
const notifyModeSchema = z.enum(["NONE", "EACH", "DAILY"]);
const grantRoleSchema = z.enum(["VIEWER", "EDITOR", "MANAGER"]);
const grantScopeSchema = z.enum(["ALL_MEMBERS", "LEADS_ONLY"]);

/**
 * Verwachte invoerfouten. Die komen als rode toast terug (zie CLAUDE.md); al de
 * rest gooit door naar de error boundary en de monitoring, want dat is een bug.
 */
const EXPECTED_ERRORS = new Set([
  "FORBIDDEN",
  "FORM_NOT_FOUND",
  "GROUP_REQUIRED",
  "TITLE_REQUIRED",
  "SLUG_TAKEN",
  "NO_FIELDS_TO_PUBLISH",
  "CONSENT_TEXT_REQUIRED",
  "USER_NOT_FOUND",
  "LAST_MANAGER",
  "GRANT_NOT_FOUND",
  "PAGE_FORBIDDEN",
  "PAGE_TAKEN",
]);

type Outcome<T> = { ok: true; value: T } | { ok: false; state: SaveState };

/**
 * Voert een actie uit en vertaalt verwachte fouten naar een `SaveState`. De
 * aanroeper doet zijn `redirect()` erná, buiten elke try/catch, want die werkt
 * via een throw.
 */
async function guard<T>(run: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    unstable_rethrow(error);
    const code = error instanceof Error ? error.message : "";
    if (EXPECTED_ERRORS.has(code) || code.startsWith("INVALID_")) {
      return { ok: false, state: saveError(code) };
    }
    console.error("Formulier-actie mislukt", error);
    throw error;
  }
}

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function limited(formData: FormData, key: string, maxLength: number): string {
  const raw = value(formData, key);
  if (raw.length > maxLength) throw new Error(`INVALID_${key.toUpperCase()}`);
  return raw;
}

function limitedOptional(formData: FormData, key: string, maxLength: number): string | null {
  return limited(formData, key, maxLength) || null;
}

function checkbox(formData: FormData, key: string): boolean {
  const raw = value(formData, key);
  return raw === "on" || raw === "true";
}

function dateValue(formData: FormData, key: string): Date | null {
  const raw = value(formData, key);
  if (!raw) return null;
  try {
    return localDateTimeToUtc(raw);
  } catch {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }
}

function boundedInteger(
  formData: FormData,
  key: string,
  minimum: number,
  maximum: number
): number | null {
  const raw = value(formData, key);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }
  return parsed;
}

/** Eén adres per regel; leeg is prima, maar een tikfout niet. */
function emailList(formData: FormData, key: string): string[] {
  const raw = limited(formData, key, 2_000);
  if (!raw) return [];
  const addresses = raw
    .split(/[\n,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (addresses.length > 20) throw new Error(`INVALID_${key.toUpperCase()}`);
  for (const address of addresses) {
    if (!z.string().email().safeParse(address).success) {
      throw new Error(`INVALID_${key.toUpperCase()}`);
    }
  }
  return [...new Set(addresses)];
}

function localePath(locale: "nl" | "en", path: string): string {
  return `${locale === "en" ? "/en" : ""}${path}`;
}

/**
 * Ververst zowel de beheerpagina's als de publieke route. De beheerpagina hoort
 * er expliciet bij: anders blijft de lijst waar je net iets wijzigde ongewijzigd
 * staan (zie CLAUDE.md).
 */
function refreshForm(locale: "nl" | "en", formId: string, slug?: string) {
  for (const path of [
    "/admin/formulieren",
    `/admin/formulieren/${formId}`,
    `/admin/formulieren/${formId}/instellingen`,
    `/admin/formulieren/${formId}/velden`,
    `/admin/formulieren/${formId}/toegang`,
    "/formulieren",
    ...(slug ? [`/formulieren/${slug}`] : []),
  ]) {
    revalidatePath(localePath(locale, path));
    revalidatePath(localePath(locale === "nl" ? "en" : "nl", path));
  }
}

/**
 * Een vrije URL-naam die nog niet bezet is. `current` blijft toegestaan, zodat
 * opslaan zonder de naam te wijzigen niet op zichzelf botst.
 */
async function uniqueSlug(input: string, fallback: string, current?: string): Promise<string> {
  const slug = slugify(input) || slugify(fallback);
  if (!slug || slug.length < 2) throw new Error("INVALID_SLUG");
  if (slug === current) return slug;
  const taken = await prisma.form.findUnique({ where: { slug }, select: { id: true } });
  if (taken) throw new Error("SLUG_TAKEN");
  return slug;
}

async function readCalendarEventId(
  formData: FormData,
  ownerGroupId: string
): Promise<string | null> {
  const calendarEventId = limitedOptional(formData, "calendarEventId", 60);
  if (!calendarEventId) return null;
  const event = await prisma.calendarEvent.findUnique({
    where: { id: calendarEventId },
    select: { groupId: true, form: { select: { id: true } } },
  });
  if (!event || event.groupId !== ownerGroupId) throw new Error("INVALID_CALENDAREVENTID");
  return calendarEventId;
}

/**
 * De pagina waarin dit formulier komt te staan. Leeg betekent: op geen enkele
 * pagina, enkel op zijn eigen adres.
 */
async function readPageId(
  formData: FormData,
  session: SessionPayload,
  formId: string | null
): Promise<string | null> {
  const pageId = limitedOptional(formData, "pageId", 60);
  if (!pageId) return null;
  await checkPageForForm(session, pageId, formId);
  return pageId;
}

/**
 * Titel van het formulier voor in het adminlogboek. Het formulier heeft ook zijn
 * eigen auditlog (FormAuditLog); dit is de regel die in het overzicht van álle
 * admin-acties belandt.
 */
async function formTitle(formId: string): Promise<string> {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { titleNl: true },
  });
  return form?.titleNl ?? formId;
}

// -----------------------------------------------------------------------------
// Formulier aanmaken
// -----------------------------------------------------------------------------

export async function createFormAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const locale = localeSchema.parse(value(formData, "locale") || "nl");

  const outcome = await guard(async () => {
    const session = await requireSession();
    const ownerGroupId = value(formData, "ownerGroupId");
    if (!ownerGroupId) throw new Error("GROUP_REQUIRED");
    if (!(await canCreateFormForGroup(session.user.id, ownerGroupId, session.user.isSuperAdmin))) {
      throw new Error("FORBIDDEN");
    }

    const titleNl = limited(formData, "titleNl", 200);
    if (!titleNl) throw new Error("TITLE_REQUIRED");
    const titleEn = limitedOptional(formData, "titleEn", 200);
    const slug = await uniqueSlug(value(formData, "slug") || titleNl, titleNl);
    const calendarEventId = await readCalendarEventId(formData, ownerGroupId);
    const pageId = await readPageId(formData, session, null);

    const form = await prisma.$transaction(async (tx) => {
      const created = await tx.form.create({
        data: {
          slug,
          titleNl,
          titleEn,
          ownerGroupId,
          calendarEventId,
          pageId,
          createdById: session.user.id,
          audience: audienceSchema.parse(value(formData, "audience") || "PUBLIC"),
        },
        select: { id: true, slug: true },
      });

      // De maker en de leiding van de eigenaarspost krijgen meteen toegang;
      // anders staat een net gemaakt formulier op slot voor iedereen behalve
      // wie forms.manageAll heeft.
      await tx.formUserGrant.create({
        data: {
          formId: created.id,
          userId: session.user.id,
          role: "MANAGER",
          grantedById: session.user.id,
        },
      });
      await tx.formGroupGrant.create({
        data: {
          formId: created.id,
          groupId: ownerGroupId,
          role: "MANAGER",
          scope: "LEADS_ONLY",
          grantedById: session.user.id,
        },
      });
      await logFormAudit(tx, {
        formId: created.id,
        actorUserId: session.user.id,
        action: "FORM_CREATED",
        entityType: "Form",
        entityId: created.id,
        metadata: { slug: created.slug },
      });
      return created;
    });

    await logAudit({
      action: "create",
      entity: "form",
      entityId: form.id,
      target: titleNl,
      summary: `/formulieren/${form.slug}`,
    });

    refreshForm(locale, form.id, form.slug);
    return form.id;
  });

  if (!outcome.ok) return outcome.state;
  // De navigatie naar de veldeditor is zelf de bevestiging; buiten de try/catch,
  // want redirect() werkt via een throw.
  redirect(localePath(locale, `/admin/formulieren/${outcome.value}/velden`));
}

// -----------------------------------------------------------------------------
// Instellingen opslaan
// -----------------------------------------------------------------------------

export async function saveFormSettingsAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const outcome = await guard(async () => {
    const locale = localeSchema.parse(value(formData, "locale") || "nl");
    const formId = value(formData, "formId");
    const { session, form } = await requireFormCapability(formId, "MANAGE_FORM");

    const titleNl = limited(formData, "titleNl", 200);
    if (!titleNl) throw new Error("TITLE_REQUIRED");

    // De status zelf staat op het overzicht, niet in dit formulier; hier komt ze
    // enkel ongewijzigd mee zodat opslaan haar niet stilletjes terugzet.
    const status = statusSchema.parse(value(formData, "status") || form.status);

    const requireConsent = checkbox(formData, "requireConsent");
    const consentTextNl = limitedOptional(formData, "consentTextNl", 1_000);
    if (requireConsent && !consentTextNl) throw new Error("CONSENT_TEXT_REQUIRED");

    const opensAt = dateValue(formData, "opensAt");
    const closesAt = dateValue(formData, "closesAt");
    if (opensAt && closesAt && closesAt <= opensAt) throw new Error("INVALID_CLOSESAT");

    const slug = await uniqueSlug(value(formData, "slug") || titleNl, titleNl, form.slug);
    const calendarEventId = await readCalendarEventId(formData, form.ownerGroupId);
    const pageId = await readPageId(formData, session, form.id);

    const data: Prisma.FormUpdateInput = {
      slug,
      titleNl,
      titleEn: limitedOptional(formData, "titleEn", 200),
      introNl: limitedOptional(formData, "introNl", 20_000),
      introEn: limitedOptional(formData, "introEn", 20_000),
      status,
      audience: audienceSchema.parse(value(formData, "audience") || "PUBLIC"),
      listed: checkbox(formData, "listed"),
      localeMode: localeModeSchema.parse(value(formData, "localeMode") || "BOTH"),
      unavailableNl: limitedOptional(formData, "unavailableNl", 1_000),
      unavailableEn: limitedOptional(formData, "unavailableEn", 1_000),
      opensAt,
      closesAt,
      maxEntries: boundedInteger(formData, "maxEntries", 1, 100_000),
      allowWaitlist: checkbox(formData, "allowWaitlist"),
      stepBySections: checkbox(formData, "stepBySections"),
      allowMultipleSubmissions: checkbox(formData, "allowMultipleSubmissions"),
      allowEditAfterSubmit: checkbox(formData, "allowEditAfterSubmit"),
      allowDrafts: checkbox(formData, "allowDrafts"),
      confirmationEnabled: checkbox(formData, "confirmationEnabled"),
      confirmationSubjectNl: limitedOptional(formData, "confirmationSubjectNl", 200),
      confirmationSubjectEn: limitedOptional(formData, "confirmationSubjectEn", 200),
      confirmationBodyNl: limitedOptional(formData, "confirmationBodyNl", 10_000),
      confirmationBodyEn: limitedOptional(formData, "confirmationBodyEn", 10_000),
      confirmationIncludeAnswers: checkbox(formData, "confirmationIncludeAnswers"),
      confirmationIncludeIcs: checkbox(formData, "confirmationIncludeIcs"),
      notifyMode: notifyModeSchema.parse(value(formData, "notifyMode") || "NONE"),
      notifyEmails: emailList(formData, "notifyEmails"),
      thankYouNl: limitedOptional(formData, "thankYouNl", 5_000),
      thankYouEn: limitedOptional(formData, "thankYouEn", 5_000),
      requireConsent,
      consentTextNl,
      consentTextEn: limitedOptional(formData, "consentTextEn", 1_000),
      retentionDays: boundedInteger(formData, "retentionDays", 1, 3_650),
      calendarEvent: calendarEventId ? { connect: { id: calendarEventId } } : { disconnect: true },
      page: pageId ? { connect: { id: pageId } } : { disconnect: true },
      // Eén keer gepubliceerd blijft `publishedAt` staan; het is het moment
      // waarop het formulier voor het eerst online kwam, geen statusvlag.
      publishedAt: status === "PUBLISHED" && !form.publishedAt ? new Date() : undefined,
      archivedAt: status === "ARCHIVED" ? (form.archivedAt ?? new Date()) : null,
    };

    await prisma.$transaction(async (tx) => {
      await tx.form.update({ where: { id: formId }, data });
      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: "FORM_UPDATED",
        entityType: "Form",
        entityId: formId,
        metadata: { status, slug },
      });
    });

    await logAudit({
      action: "update",
      entity: "form",
      entityId: formId,
      target: titleNl,
      summary: form.slug === slug ? "instellingen bewerkt" : `slug van ${form.slug} naar ${slug}`,
    });

    refreshForm(locale, formId, slug);
    if (form.slug !== slug) refreshForm(locale, formId, form.slug);
    // Beide kanten: de pagina waar het formulier vandaan komt en die waar het
    // naartoe gaat. Enkel de nieuwe verversen laat het paneel op de oude staan.
    await refreshFormPage(form.pageId);
    if (form.pageId !== pageId) await refreshFormPage(pageId);
  });

  return outcome.ok ? saveOk() : outcome.state;
}

// -----------------------------------------------------------------------------
// Status
// -----------------------------------------------------------------------------

/**
 * Enkel de status wisselen, los van de rest van de instellingen.
 *
 * Staat bewust apart: of een formulier online staat, is de beslissing die je het
 * vaakst neemt en het snelst wil kunnen terugdraaien. Ze hoort daarom op het
 * overzicht en op de overzichtstab van één form, niet weggestopt tussen twintig
 * andere instellingen.
 */
export async function setFormStatusAction(
  formId: string,
  nextStatus: string,
  rawLocale?: string
): Promise<SaveState> {
  const outcome = await guard(async () => {
    const locale = localeSchema.parse(rawLocale || "nl");
    const { session, form } = await requireFormCapability(formId, "MANAGE_FORM");
    const status = statusSchema.parse(nextStatus);
    if (status === form.status) return;

    // Een leeg formulier online zetten geeft de bezoeker een pagina met enkel een
    // verzendknop; de instellingenpagina bewaakte dit al, dit is dezelfde grendel.
    if (status === "PUBLISHED") {
      const fieldCount = await prisma.formField.count({ where: { formId, archivedAt: null } });
      if (fieldCount === 0) throw new Error("NO_FIELDS_TO_PUBLISH");
    }

    await prisma.$transaction(async (tx) => {
      await tx.form.update({
        where: { id: formId },
        data: {
          status,
          // `publishedAt` is het moment van de eerste keer online, geen statusvlag.
          publishedAt: status === "PUBLISHED" && !form.publishedAt ? new Date() : undefined,
          archivedAt: status === "ARCHIVED" ? (form.archivedAt ?? new Date()) : null,
        },
      });
      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: "FORM_UPDATED",
        entityType: "Form",
        entityId: formId,
        metadata: { status },
      });
    });

    await logAudit({
      action: status === "PUBLISHED" ? "publish" : "update",
      entity: "form",
      entityId: formId,
      target: form.titleNl,
      summary: `status van ${form.status} naar ${status}`,
    });

    refreshForm(locale, formId, form.slug);
    await refreshFormPage(form.pageId);
  });

  return outcome.ok ? saveOk() : outcome.state;
}

// -----------------------------------------------------------------------------
// Verwijderen en dupliceren
// -----------------------------------------------------------------------------

export async function deleteFormAction(formData: FormData): Promise<void> {
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const formId = value(formData, "formId");
  const { session, form } = await requireFormCapability(formId, "MANAGE_FORM");

  await prisma.$transaction(async (tx) => {
    // De auditregels hangen aan het formulier en verdwijnen mee; de log van een
    // verwijderd formulier heeft geen lezer meer, en bewaren zou betekenen dat
    // de inzendingen die erin genoemd worden er niet meer zijn.
    await tx.form.delete({ where: { id: formId } });
  });

  await logAudit({
    action: "delete",
    entity: "form",
    entityId: formId,
    target: form.titleNl,
    summary: `/formulieren/${form.slug}, met alle inzendingen erop`,
  });

  console.info(`[forms] formulier ${form.slug} (${formId}) verwijderd door ${session.user.email}`);
  refreshForm(locale, formId, form.slug);
  // De pagina waarop het stond, houdt anders een paneel over dat er niet meer is.
  await refreshFormPage(form.pageId);
  redirect(localePath(locale, "/admin/formulieren"));
}

export async function duplicateFormAction(formData: FormData): Promise<void> {
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const formId = value(formData, "formId");
  const { session, form } = await requireFormCapability(formId, "MANAGE_FORM");

  const [sections, fields, options, conditions] = await Promise.all([
    prisma.formSection.findMany({ where: { formId }, orderBy: { sortOrder: "asc" } }),
    prisma.formField.findMany({
      where: { formId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.formFieldOption.findMany({
      where: { formId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.formFieldCondition.findMany({ where: { formId } }),
  ]);

  const suffix = locale === "nl" ? "kopie" : "copy";
  const slug = await uniqueSlug(`${form.slug}-${suffix}`, `${form.slug}-${suffix}`);

  const copyId = await prisma.$transaction(async (tx) => {
    const copy = await tx.form.create({
      data: {
        slug,
        // Een kopie is per definitie nog niet af, dus ze begint als concept en
        // zonder koppeling aan het kalenderevenement van vorig jaar.
        status: "DRAFT",
        titleNl: `${form.titleNl} (${suffix})`,
        titleEn: form.titleEn ? `${form.titleEn} (copy)` : null,
        introNl: form.introNl,
        introEn: form.introEn,
        ownerGroupId: form.ownerGroupId,
        createdById: session.user.id,
        audience: form.audience,
        listed: form.listed,
        localeMode: form.localeMode,
        unavailableNl: form.unavailableNl,
        unavailableEn: form.unavailableEn,
        maxEntries: form.maxEntries,
        allowWaitlist: form.allowWaitlist,
        stepBySections: form.stepBySections,
        allowMultipleSubmissions: form.allowMultipleSubmissions,
        allowEditAfterSubmit: form.allowEditAfterSubmit,
        allowDrafts: form.allowDrafts,
        confirmationEnabled: form.confirmationEnabled,
        confirmationSubjectNl: form.confirmationSubjectNl,
        confirmationSubjectEn: form.confirmationSubjectEn,
        confirmationBodyNl: form.confirmationBodyNl,
        confirmationBodyEn: form.confirmationBodyEn,
        confirmationIncludeAnswers: form.confirmationIncludeAnswers,
        confirmationIncludeIcs: form.confirmationIncludeIcs,
        notifyMode: form.notifyMode,
        notifyEmails: form.notifyEmails,
        thankYouNl: form.thankYouNl,
        thankYouEn: form.thankYouEn,
        requireConsent: form.requireConsent,
        consentTextNl: form.consentTextNl,
        consentTextEn: form.consentTextEn,
        retentionDays: form.retentionDays,
      },
      select: { id: true },
    });

    const sectionIds = new Map<string, string>();
    for (const section of sections) {
      const created = await tx.formSection.create({
        data: {
          formId: copy.id,
          sortOrder: section.sortOrder,
          titleNl: section.titleNl,
          titleEn: section.titleEn,
          descriptionNl: section.descriptionNl,
          descriptionEn: section.descriptionEn,
        },
        select: { id: true },
      });
      sectionIds.set(section.id, created.id);
    }

    const fieldIds = new Map<string, string>();
    for (const field of fields) {
      const created = await tx.formField.create({
        data: {
          formId: copy.id,
          sectionId: field.sectionId ? (sectionIds.get(field.sectionId) ?? null) : null,
          code: field.code,
          type: field.type,
          sortOrder: field.sortOrder,
          labelNl: field.labelNl,
          labelEn: field.labelEn,
          helpNl: field.helpNl,
          helpEn: field.helpEn,
          required: field.required,
          config: field.config as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      fieldIds.set(field.id, created.id);
    }

    for (const option of options) {
      const fieldId = fieldIds.get(option.fieldId);
      if (!fieldId) continue;
      await tx.formFieldOption.create({
        data: {
          formId: copy.id,
          fieldId,
          code: option.code,
          labelNl: option.labelNl,
          labelEn: option.labelEn,
          sortOrder: option.sortOrder,
          // Het quotum zelf gaat mee, de teller niet: dit is een nieuw jaar.
          quotaLimit: option.quotaLimit,
        },
      });
    }

    for (const condition of conditions) {
      const fieldId = fieldIds.get(condition.fieldId);
      const sourceFieldId = fieldIds.get(condition.sourceFieldId);
      if (!fieldId || !sourceFieldId) continue;
      await tx.formFieldCondition.create({
        data: {
          formId: copy.id,
          fieldId,
          sourceFieldId,
          operator: condition.operator,
          value: condition.value,
          sortOrder: condition.sortOrder,
        },
      });
    }

    await tx.formUserGrant.create({
      data: {
        formId: copy.id,
        userId: session.user.id,
        role: "MANAGER",
        grantedById: session.user.id,
      },
    });
    await tx.formGroupGrant.create({
      data: {
        formId: copy.id,
        groupId: form.ownerGroupId,
        role: "MANAGER",
        scope: "LEADS_ONLY",
        grantedById: session.user.id,
      },
    });
    await logFormAudit(tx, {
      formId: copy.id,
      actorUserId: session.user.id,
      action: "FORM_DUPLICATED",
      entityType: "Form",
      entityId: copy.id,
      metadata: { sourceFormId: formId },
    });
    return copy.id;
  });

  await logAudit({
    action: "create",
    entity: "form",
    entityId: copyId,
    target: `${form.titleNl} (${suffix})`,
    summary: `kopie van ${form.titleNl}, als concept`,
  });

  refreshForm(locale, copyId, slug);
  redirect(localePath(locale, `/admin/formulieren/${copyId}/instellingen`));
}

// -----------------------------------------------------------------------------
// Toegang
// -----------------------------------------------------------------------------

export async function addFormUserGrantAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const outcome = await guard(async () => {
    const locale = localeSchema.parse(value(formData, "locale") || "nl");
    const formId = value(formData, "formId");
    const { session } = await requireFormCapability(formId, "MANAGE_ACCESS");

    const userId = limitedOptional(formData, "userId", 60);
    const email = limitedOptional(formData, "email", 320)?.toLowerCase() ?? null;
    if (!userId && !email) throw new Error("USER_REQUIRED");
    if (!userId && email && !z.string().email().safeParse(email).success) {
      throw new Error("INVALID_EMAIL");
    }
    const role = grantRoleSchema.parse(value(formData, "role") || "EDITOR");

    const user = await prisma.user.findFirst({
      where: {
        ...(userId ? { id: userId } : { email: email ?? "" }),
        active: true,
        deletedAt: null,
      },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw new Error("USER_NOT_FOUND");

    await prisma.$transaction(async (tx) => {
      await tx.formUserGrant.upsert({
        where: { formId_userId: { formId, userId: user.id } },
        update: { role, grantedById: session.user.id },
        create: { formId, userId: user.id, role, grantedById: session.user.id },
      });
      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: "FORM_GRANT_SET",
        entityType: "FormUserGrant",
        entityId: user.id,
        metadata: { role, email: user.email },
      });
    });

    await logAudit({
      action: "grant",
      entity: "formAccess",
      entityId: formId,
      target: await formTitle(formId),
      summary: `${user.name} kreeg de rol ${role}`,
    });

    refreshForm(locale, formId);
  });

  return outcome.ok ? saveOk() : outcome.state;
}

export async function addFormGroupGrantAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const outcome = await guard(async () => {
    const locale = localeSchema.parse(value(formData, "locale") || "nl");
    const formId = value(formData, "formId");
    const { session } = await requireFormCapability(formId, "MANAGE_ACCESS");

    const groupId = value(formData, "groupId");
    if (!groupId) throw new Error("GROUP_REQUIRED");
    const role = grantRoleSchema.parse(value(formData, "role") || "EDITOR");
    const scope = grantScopeSchema.parse(value(formData, "scope") || "LEADS_ONLY");

    await prisma.$transaction(async (tx) => {
      await tx.formGroupGrant.upsert({
        where: { formId_groupId: { formId, groupId } },
        update: { role, scope, grantedById: session.user.id },
        create: { formId, groupId, role, scope, grantedById: session.user.id },
      });
      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: "FORM_GROUP_GRANT_SET",
        entityType: "FormGroupGrant",
        entityId: groupId,
        metadata: { role, scope },
      });
    });

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { nameNl: true },
    });
    await logAudit({
      action: "grant",
      entity: "formAccess",
      entityId: formId,
      target: await formTitle(formId),
      summary: `post ${group?.nameNl ?? groupId} kreeg de rol ${role} (${
        scope === "LEADS_ONLY" ? "enkel de verantwoordelijke" : "elk lid"
      })`,
    });

    refreshForm(locale, formId);
  });

  return outcome.ok ? saveOk() : outcome.state;
}

export async function removeFormGrantAction(formData: FormData): Promise<void> {
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const formId = value(formData, "formId");
  const grantId = value(formData, "grantId");
  const kind = value(formData, "kind") === "group" ? "group" : "user";
  const { session } = await requireFormCapability(formId, "MANAGE_ACCESS");

  await prisma.$transaction(async (tx) => {
    if (kind === "group") {
      const grant = await tx.formGroupGrant.findFirst({ where: { id: grantId, formId } });
      if (!grant) throw new Error("GRANT_NOT_FOUND");
      await tx.formGroupGrant.delete({ where: { id: grantId } });
    } else {
      const grant = await tx.formUserGrant.findFirst({ where: { id: grantId, formId } });
      if (!grant) throw new Error("GRANT_NOT_FOUND");
      // Zonder deze grens kan de laatste beheerder zichzelf buitensluiten, en dan
      // geraakt enkel iemand met forms.manageAll nog aan het formulier.
      if (grant.role === "MANAGER") {
        const managers = await tx.formUserGrant.count({ where: { formId, role: "MANAGER" } });
        if (managers <= 1) throw new Error("LAST_MANAGER");
      }
      await tx.formUserGrant.delete({ where: { id: grantId } });
    }
    await logFormAudit(tx, {
      formId,
      actorUserId: session.user.id,
      action: "FORM_GRANT_REMOVED",
      entityType: kind === "group" ? "FormGroupGrant" : "FormUserGrant",
      entityId: grantId,
    });
  });

  await logAudit({
    action: "revoke",
    entity: "formAccess",
    entityId: formId,
    target: await formTitle(formId),
    summary: kind === "group" ? "toegang van een post ingetrokken" : "toegang van een persoon ingetrokken",
  });

  refreshForm(locale, formId);
}

// -----------------------------------------------------------------------------
// Korte link
// -----------------------------------------------------------------------------

/**
 * Maakt (of hergebruikt) een verkorte link naar het formulier, om op een
 * affiche of in een story te zetten. De QR-code wordt uit die link getekend.
 *
 * Bewust een gewone `ShortLink`: die tabel bestaat al, wordt al beheerd op
 * /admin/links, en telt kliks. Een tweede, formulier-eigen linksysteem zou dat
 * allemaal opnieuw moeten doen.
 */
export async function createFormShortLinkAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const outcome = await guard(async () => {
    const locale = localeSchema.parse(value(formData, "locale") || "nl");
    const formId = value(formData, "formId");
    const { session, form } = await requireFormCapability(formId, "MANAGE_FORM");

    const base = (
      process.env.TICKETING_PUBLIC_URL?.trim() ||
      process.env.VTK_MAIN_URL?.trim() ||
      "https://vtk.be"
    ).replace(/\/$/, "");
    const target = `${base}/formulieren/${form.slug}`;

    const existing = await prisma.shortLink.findFirst({ where: { url: target } });
    if (existing) {
      // Al eentje: die blijft, want hij hangt misschien al ergens op een affiche.
      if (!existing.enabled) {
        await prisma.shortLink.update({ where: { id: existing.id }, data: { enabled: true } });
      }
      refreshForm(locale, formId, form.slug);
      return;
    }

    const wanted = slugify(value(formData, "slug") || form.slug).slice(0, 40);
    let slug = wanted || "formulier";
    // Botst de gewenste naam, dan plakken we er een cijfer achter in plaats van
    // te falen: dit is een knop, geen formulier met een foutmelding.
    for (let attempt = 2; attempt < 50; attempt += 1) {
      const taken = await prisma.shortLink.count({ where: { slug } });
      if (!taken) break;
      slug = `${wanted}-${attempt}`.slice(0, 48);
    }

    await prisma.$transaction(async (tx) => {
      await tx.shortLink.create({
        data: {
          slug,
          url: target,
          note: `Formulier: ${form.titleNl}`,
          createdById: session.user.id,
        },
      });
      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: "FORM_SHORTLINK_CREATED",
        entityType: "Form",
        entityId: formId,
        metadata: { slug },
      });
    });

    await logAudit({
      action: "create",
      entity: "shortLink",
      target: `on.vtk.be/${slug}`,
      summary: `verkorte link naar formulier ${form.titleNl}`,
    });

    refreshForm(locale, formId, form.slug);
  });

  return outcome.ok ? saveOk() : outcome.state;
}
