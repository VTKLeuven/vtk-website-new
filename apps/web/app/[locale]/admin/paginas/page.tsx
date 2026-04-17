import Link from "next/link";
import { prisma } from "@vtk/db";
import { Button, Card } from "@vtk/ui";
import { requirePermission } from "@/lib/session";
import { hasLocale } from "@/lib/locale";
import { notFound } from "next/navigation";
import { pick, type Locale } from "@vtk/i18n";

export default async function AdminPagesList({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("pages.edit");
  const base = locale === "nl" ? "" : "/en";

  const pages = await prisma.page.findMany({
    include: { headerTab: true },
    orderBy: [{ headerTabId: "asc" }, { order: "asc" }, { titleNl: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{locale === "nl" ? "Pagina's" : "Pages"}</h1>
        <Link href={`${base}/admin/paginas/new`}>
          <Button>{locale === "nl" ? "Nieuwe pagina" : "New page"}</Button>
        </Link>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-vtk-blue-soft text-left">
            <tr>
              <th className="px-4 py-2">{locale === "nl" ? "Titel" : "Title"}</th>
              <th className="px-4 py-2">{locale === "nl" ? "Slug" : "Slug"}</th>
              <th className="px-4 py-2">Header</th>
              <th className="px-4 py-2">{locale === "nl" ? "Gepubliceerd" : "Published"}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.id} className="border-t border-zinc-200">
                <td className="px-4 py-2 font-medium">{pick(p.titleNl, p.titleEn, locale)}</td>
                <td className="px-4 py-2 text-zinc-500">/{p.slug}</td>
                <td className="px-4 py-2 text-zinc-500">
                  {p.headerTab ? pick(p.headerTab.labelNl, p.headerTab.labelEn, locale) : "—"}
                  {p.headerTab && !p.visibleInHeader ? " (hidden)" : ""}
                </td>
                <td className="px-4 py-2">{p.publishedAt ? "✓" : "—"}</td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`${base}/admin/paginas/${p.id}`}
                    className="text-vtk-blue hover:underline"
                  >
                    {locale === "nl" ? "Bewerken" : "Edit"}
                  </Link>
                </td>
              </tr>
            ))}
            {pages.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  {locale === "nl" ? "Nog geen pagina's" : "No pages yet"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
