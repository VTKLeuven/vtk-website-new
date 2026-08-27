import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { hasPermission, type SessionPayload } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { canEditPageContent } from "@/lib/pageAccess";
import { formCapabilitiesByForm, visibleFormsFilter } from "@/lib/forms/authorization";

/**
 * De koppeling tussen een formulier en een contentpagina, vanaf beide kanten.
 *
 * De regel is in beide richtingen dezelfde: een formulier op een pagina zetten
 * is de pagina bewerken, dus je hebt de bewerkrechten van die pagina nodig. Wie
 * enkel het formulier beheert, kan het dus niet op een willekeurige pagina van
 * iemand anders laten verschijnen.
 */

/** De pagina waarop dit formulier mag komen, of een verwachte fout. */
export async function checkPageForForm(
  session: SessionPayload,
  pageId: string,
  formId: string | null
): Promise<void> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      editorRoles: { select: { roleId: true } },
      form: { select: { id: true } },
    },
  });
  if (!page) throw new Error("INVALID_PAGEID");
  if (!canEditPageContent(session, page)) throw new Error("PAGE_FORBIDDEN");
  // De koppeling is uniek; zonder deze check kwam dat als een databasefout in de
  // error boundary terecht in plaats van als een uitleg in een rode toast.
  if (page.form && page.form.id !== formId) throw new Error("PAGE_TAKEN");
}

export type PageOption = { id: string; label: string };

/**
 * De pagina's waarop deze gebruiker een formulier mag zetten: de pagina's die
 * hij mag bewerken en waar nog geen ander formulier op staat. De pagina die er
 * nu aan hangt blijft in de lijst, anders verdwijnt de eigen keuze eruit.
 */
export async function linkablePages(
  session: SessionPayload,
  locale: Locale,
  currentPageId: string | null
): Promise<PageOption[]> {
  const editAll = session.user.isSuperAdmin || hasPermission(session, "pages.editAll");
  if (!editAll && !hasPermission(session, "pages.edit")) {
    return currentPageId ? await ownPageOption(locale, currentPageId) : [];
  }

  const pages = await prisma.page.findMany({
    where: {
      ...(editAll ? {} : { editorRoles: { some: { roleId: { in: session.roleIds } } } }),
      OR: [{ form: null }, ...(currentPageId ? [{ id: currentPageId }] : [])],
    },
    select: { id: true, slug: true, titleNl: true, titleEn: true, publishedAt: true },
    orderBy: [{ titleNl: "asc" }],
    take: 300,
  });

  return pages.map((page) => ({
    id: page.id,
    label: `${locale === "en" && page.titleEn ? page.titleEn : page.titleNl} · /${page.slug}${
      page.publishedAt ? "" : locale === "nl" ? " (concept)" : " (draft)"
    }`,
  }));
}

/**
 * De al gekoppelde pagina, ook wanneer de gebruiker ze zelf niet mag bewerken.
 * Zonder dit valt de keuzelijst terug op "geen pagina" en zou opslaan de
 * koppeling stil weghalen.
 */
async function ownPageOption(locale: Locale, pageId: string): Promise<PageOption[]> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { id: true, slug: true, titleNl: true, titleEn: true },
  });
  if (!page) return [];
  return [
    {
      id: page.id,
      label: `${locale === "en" && page.titleEn ? page.titleEn : page.titleNl} · /${page.slug}`,
    },
  ];
}

export type FormOption = { id: string; label: string; status: string };

/**
 * De formulieren die deze gebruiker aan een pagina mag hangen: wat hij echt
 * beheert (zien is niet genoeg om te beslissen waar iets verschijnt) en wat nog
 * nergens anders staat. Het formulier dat er al op staat blijft erbij, om
 * dezelfde reden als hierboven.
 */
export async function linkableForms(
  locale: Locale,
  currentFormId: string | null
): Promise<FormOption[]> {
  const forms = await prisma.form.findMany({
    where: {
      AND: [
        await visibleFormsFilter(),
        { archivedAt: null },
        { OR: [{ pageId: null }, ...(currentFormId ? [{ id: currentFormId }] : [])] },
      ],
    },
    select: { id: true, slug: true, titleNl: true, titleEn: true, status: true },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });

  const capabilities = await formCapabilitiesByForm(forms.map((form) => form.id));
  return forms
    .filter((form) => capabilities.get(form.id)?.includes("MANAGE_FORM"))
    .map((form) => ({
      id: form.id,
      status: form.status,
      label: `${locale === "en" && form.titleEn ? form.titleEn : form.titleNl} · /${form.slug}`,
    }));
}

/**
 * De contentpagina waarin dit formulier staat, uit de cache halen. Nodig zodra
 * de koppeling zelf wijzigt: die pagina lag tot dan in de cache zonder formulier
 * erin, en zou het paneel dus niet tonen.
 */
export async function refreshFormPage(pageId: string | null): Promise<void> {
  if (!pageId) return;
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { slug: true, headerTab: { select: { slug: true } } },
  });
  if (!page) return;
  // Een pagina onder een categorie is ook los bereikbaar via /p/<slug>, dus
  // beide vormen, en beide talen.
  for (const path of [
    `/p/${page.slug}`,
    ...(page.headerTab ? [`/${page.headerTab.slug}/${page.slug}`] : []),
  ]) {
    revalidatePath(path);
    revalidatePath(`/en${path}`);
  }
}
