"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { prisma } from "@vtk/db";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { logFormAudit } from "@/lib/forms/audit";
import { canCreateFormForGroup, requireFormCapability } from "@/lib/forms/authorization";
import { checkPageForForm, refreshFormPage } from "@/lib/forms/pageLink";
import { canEditPageContent } from "@/lib/pageAccess";
import { slugify } from "@/lib/ticketing/slug";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

/**
 * Het formulier van een contentpagina, beheerd vanaf de pagina.
 *
 * Spiegelt wat de instellingen van een formulier al konden (daar kies je de
 * pagina), zodat een redacteur die op zijn pagina bezig is niet eerst naar het
 * formulierenbeheer moet om ze aan elkaar te knopen. De rechtenregel is in beide
 * richtingen dezelfde: koppelen is de pagina bewerken, dus je hebt de
 * bewerkrechten van die pagina nodig, plus het beheer van het formulier zelf.
 */

const localeSchema = z.enum(["nl", "en"]);

const EXPECTED_ERRORS = new Set([
  "FORBIDDEN",
  "FORM_NOT_FOUND",
  "PAGE_NOT_FOUND",
  "PAGE_FORBIDDEN",
  "PAGE_TAKEN",
  "TITLE_REQUIRED",
  "GROUP_REQUIRED",
  "SLUG_TAKEN",
]);

type Outcome<T> = { ok: true; value: T } | { ok: false; state: SaveState };

async function guard<T>(run: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    unstable_rethrow(error);
    const code = error instanceof Error ? error.message : "";
    if (EXPECTED_ERRORS.has(code) || code.startsWith("INVALID_")) {
      return { ok: false, state: saveError(code) };
    }
    console.error("Pagina-formulieractie mislukt", error);
    throw error;
  }
}

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function localePath(locale: "nl" | "en", path: string): string {
  return `${locale === "en" ? "/en" : ""}${path}`;
}

/** De beheerpagina hoort mee ververst: daar staat de kaart die je net wijzigde. */
function refreshEditor(locale: "nl" | "en", pageId: string) {
  for (const path of ["/admin/paginas", `/admin/paginas/${pageId}`]) {
    revalidatePath(localePath(locale, path));
    revalidatePath(localePath(locale === "nl" ? "en" : "nl", path));
  }
}

/** De pagina, met wat nodig is om te weten of deze gebruiker eraan mag. */
async function requireEditablePage(pageId: string) {
  const session = await requireSession();
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      titleNl: true,
      editorRoles: { select: { roleId: true } },
      form: { select: { id: true, titleNl: true } },
    },
  });
  if (!page) throw new Error("PAGE_NOT_FOUND");
  if (!canEditPageContent(session, page)) throw new Error("PAGE_FORBIDDEN");
  return { session, page };
}

// -----------------------------------------------------------------------------
// Een bestaand formulier aan deze pagina hangen
// -----------------------------------------------------------------------------

export async function linkFormToPageAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const outcome = await guard(async () => {
    const locale = localeSchema.parse(value(formData, "locale") || "nl");
    const pageId = value(formData, "pageId");
    const formId = value(formData, "formId");
    if (!formId) throw new Error("FORM_NOT_FOUND");

    const { session, page } = await requireEditablePage(pageId);
    // Enkel wie het formulier beheert, mag beslissen waar het verschijnt; anders
    // kan iemand met bewerkrechten op een pagina het concept van een andere post
    // online zetten.
    const { form } = await requireFormCapability(formId, "MANAGE_FORM");
    await checkPageForForm(session, pageId, formId);

    await prisma.$transaction(async (tx) => {
      await tx.form.update({ where: { id: formId }, data: { pageId } });
      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: "FORM_UPDATED",
        entityType: "Form",
        entityId: formId,
        metadata: { pageId },
      });
    });

    await logAudit({
      action: "update",
      entity: "page",
      entityId: pageId,
      target: page.titleNl,
      summary: `formulier "${form.titleNl}" op de pagina gezet`,
    });

    refreshEditor(locale, pageId);
    await refreshFormPage(pageId);
  });

  return outcome.ok ? saveOk() : outcome.state;
}

// -----------------------------------------------------------------------------
// Het formulier van deze pagina halen
// -----------------------------------------------------------------------------

/**
 * Loskoppelen, niet verwijderen: het formulier blijft bestaan met al zijn
 * inzendingen en houdt zijn eigen adres. Enkel het paneel verdwijnt van de
 * pagina. De bevestigingsdialoog zegt dat ook, want "verwijderen" is precies wat
 * iemand hier vreest.
 */
export async function unlinkFormFromPageAction(formData: FormData): Promise<void> {
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const pageId = value(formData, "pageId");
  const { session, page } = await requireEditablePage(pageId);
  if (!page.form) return;

  await prisma.$transaction(async (tx) => {
    await tx.form.update({ where: { id: page.form!.id }, data: { pageId: null } });
    await logFormAudit(tx, {
      formId: page.form!.id,
      actorUserId: session.user.id,
      action: "FORM_UPDATED",
      entityType: "Form",
      entityId: page.form!.id,
      metadata: { pageId: null },
    });
  });

  await logAudit({
    action: "update",
    entity: "page",
    entityId: pageId,
    target: page.titleNl,
    summary: `formulier "${page.form.titleNl}" van de pagina gehaald`,
  });

  refreshEditor(locale, pageId);
  await refreshFormPage(pageId);
}

// -----------------------------------------------------------------------------
// Meteen een nieuw formulier voor deze pagina
// -----------------------------------------------------------------------------

/**
 * Maakt een leeg formulier aan, hangt het aan deze pagina en gaat door naar de
 * veldeditor. Bewust dezelfde startsituatie als `/admin/formulieren/nieuw`: een
 * concept, met de maker en de leiding van de eigenaarspost als beheerder.
 */
export async function createFormForPageAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const locale = localeSchema.parse(value(formData, "locale") || "nl");

  const outcome = await guard(async () => {
    const pageId = value(formData, "pageId");
    const { session, page } = await requireEditablePage(pageId);
    if (page.form) throw new Error("PAGE_TAKEN");

    const ownerGroupId = value(formData, "ownerGroupId");
    if (!ownerGroupId) throw new Error("GROUP_REQUIRED");
    if (!(await canCreateFormForGroup(session.user.id, ownerGroupId, session.user.isSuperAdmin))) {
      throw new Error("FORBIDDEN");
    }

    const titleNl = value(formData, "titleNl").slice(0, 200);
    if (!titleNl) throw new Error("TITLE_REQUIRED");

    const slug = await freeSlug(titleNl);

    const formId = await prisma.$transaction(async (tx) => {
      const created = await tx.form.create({
        data: {
          slug,
          titleNl,
          ownerGroupId,
          pageId,
          createdById: session.user.id,
        },
        select: { id: true },
      });
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
        metadata: { slug, pageId },
      });
      return created.id;
    });

    await logAudit({
      action: "create",
      entity: "form",
      entityId: formId,
      target: titleNl,
      summary: `/formulieren/${slug}, op de pagina "${page.titleNl}"`,
    });

    refreshEditor(locale, pageId);
    await refreshFormPage(pageId);
    return formId;
  });

  if (!outcome.ok) return outcome.state;
  // De navigatie naar de veldeditor is zelf de bevestiging; buiten de try/catch,
  // want redirect() werkt via een throw.
  redirect(localePath(locale, `/admin/formulieren/${outcome.value}/velden`));
}

/**
 * Een vrije URL-naam. Anders dan bij `/admin/formulieren/nieuw` typt de
 * redacteur hier geen slug: hij komt uit de titel, en botst die, dan telt er een
 * cijfer bij. Een foutmelding over een URL die je niet zag, helpt niemand.
 */
async function freeSlug(title: string): Promise<string> {
  const stem = slugify(title) || "formulier";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? stem : `${stem}-${attempt + 1}`;
    const taken = await prisma.form.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new Error("SLUG_TAKEN");
}
