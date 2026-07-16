import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
import { canEditPageContent, needsYearlyReview } from "@/lib/pageAccess";
import { tiptapToMarkdown } from "@/lib/tiptap-to-markdown";
import { publicUrl } from "@/lib/storage";
import { PageContentEditor } from "./PageContentEditor";

/**
 * De inhoudseditor van één pagina: markdown (NL + optioneel EN) met voorbeeld,
 * plus de bijlagen. Toegang: superadmin of pages.editAll, of pages.edit met een
 * paginarol van de gebruiker.
 */
export default async function AdminPageEditor({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;

  const session = await requireAnyPermission(["pages.edit", "pages.editAll"]);

  const page = await prisma.page.findUnique({
    where: { id },
    include: {
      headerTab: true,
      assets: { orderBy: { order: "asc" } },
      editorRoles: { select: { roleId: true } },
    },
  });
  if (!page) notFound();
  if (!canEditPageContent(session, page)) throw new Error("FORBIDDEN");

  // Markdown is de bron van waarheid. Bestaat die nog niet, dan vullen we de
  // editor met een automatische conversie van het legacy tiptap-JSON; wie
  // opslaat, heeft het resultaat dus zelf nagekeken.
  const legacy = page.contentMdNl === null;
  const initialNl = page.contentMdNl ?? tiptapToMarkdown(page.contentJsonNl);
  const initialEn =
    page.contentMdEn ?? (page.contentJsonEn ? tiptapToMarkdown(page.contentJsonEn) : "");

  return (
    <PageContentEditor
      locale={locale}
      page={{
        id: page.id,
        slug: page.slug,
        titleNl: page.titleNl,
        titleEn: page.titleEn,
        category: page.headerTab
          ? { slug: page.headerTab.slug, label: locale === "nl" ? page.headerTab.labelNl : page.headerTab.labelEn }
          : null,
        published: page.publishedAt !== null,
        needsYearlyEdit: page.needsYearlyEdit,
        needsReview: needsYearlyReview(page),
        assets: page.assets.map((a) => ({
          id: a.id,
          labelNl: a.labelNl,
          kind: a.kind,
          storageKey: a.storageKey,
          url: publicUrl(a.storageKey),
        })),
      }}
      initialNl={initialNl}
      initialEn={initialEn}
      convertedFromLegacy={legacy}
    />
  );
}
