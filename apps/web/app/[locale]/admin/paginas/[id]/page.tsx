import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
import { canEditPageContent, canPublishPages, needsYearlyReview } from "@/lib/pageAccess";
import { canSessionCreateFormForGroup } from "@/lib/forms/authorization";
import { linkableForms } from "@/lib/forms/pageLink";
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
  const host = (await headers()).get("host") ?? "vtk.be";

  const [page, roles] = await Promise.all([
    prisma.page.findUnique({
      where: { id },
      include: {
        headerTab: true,
        assets: { orderBy: { order: "asc" } },
        editorRoles: { select: { roleId: true } },
        form: {
          select: {
            id: true,
            slug: true,
            titleNl: true,
            titleEn: true,
            status: true,
            _count: { select: { entries: true } },
          },
        },
      },
    }),
    prisma.role.findMany({ orderBy: [{ order: "asc" }, { nameNl: "asc" }] }),
  ]);
  if (!page) notFound();
  if (!canEditPageContent(session, page)) throw new Error("FORBIDDEN");

  // Wat deze gebruiker aan deze pagina kan hangen: formulieren die hij beheert
  // en die nog nergens anders staan, plus de posten waarvoor hij er een mag
  // aanmaken. Beide leeg? Dan zegt de kaart dat, in plaats van twee lege
  // keuzelijsten te tonen.
  const [forms, fieldCount, groupRows] = await Promise.all([
    page.form ? Promise.resolve([]) : linkableForms(locale, null),
    page.form
      ? prisma.formField.count({ where: { formId: page.form.id, archivedAt: null } })
      : Promise.resolve(0),
    page.form
      ? Promise.resolve([])
      : prisma.group.findMany({
          where: { active: true },
          select: { id: true, nameNl: true, nameEn: true },
          orderBy: { orderInPraesidium: "asc" },
        }),
  ]);

  const formGroups = groupRows
    .filter((group) => canSessionCreateFormForGroup(session, group.id))
    .map((group) => ({ id: group.id, name: locale === "en" ? group.nameEn : group.nameNl }));

  // Markdown is de bron van waarheid. Bestaat die nog niet, dan vullen we de
  // editor met een automatische conversie van het legacy tiptap-JSON; wie
  // opslaat, heeft het resultaat dus zelf nagekeken.
  const legacy = page.contentMdNl === null;
  const initialNl = page.contentMdNl ?? tiptapToMarkdown(page.contentJsonNl);
  const initialEn =
    page.contentMdEn ?? (page.contentJsonEn ? tiptapToMarkdown(page.contentJsonEn) : "");

  return (
    <PageContentEditor
      host={host}
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
        editorRoleIds: page.editorRoles.map((r) => r.roleId),
        form: page.form
          ? {
              id: page.form.id,
              slug: page.form.slug,
              title:
                locale === "en" && page.form.titleEn ? page.form.titleEn : page.form.titleNl,
              status: page.form.status,
              fieldCount,
              entryCount: page.form._count.entries,
            }
          : null,
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
      roles={roles.map((r) => ({ id: r.id, name: locale === "nl" ? r.nameNl : r.nameEn }))}
      myRoleIds={session.roleIds}
      canEditAll={session.user.isSuperAdmin || hasPermission(session, "pages.editAll")}
      canDelete={hasPermission(session, "pages.delete")}
      canPublish={canPublishPages(session)}
      linkableForms={forms.map((form) => ({ id: form.id, label: form.label }))}
      formGroups={formGroups}
    />
  );
}
