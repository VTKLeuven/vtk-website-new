import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { PageEditor } from "../PageEditor";
import { Card, Button, Input, Label, Select } from "@vtk/ui";
import { addPageAssetAction, deletePageAssetAction, deletePageAction } from "@/app/actions/pages";
import type { Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";
import { FileUploader } from "./FileUploader";

export default async function EditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("pages.edit");

  const [page, tabs] = await Promise.all([
    prisma.page.findUnique({
      where: { id },
      include: { assets: { orderBy: { order: "asc" } } },
    }),
    prisma.headerTab.findMany({ orderBy: { order: "asc" } }),
  ]);
  if (!page) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {locale === "nl" ? "Pagina bewerken" : "Edit page"}
      </h1>
      <PageEditor page={page} headerTabs={tabs} locale={locale} />

      <Card className="p-5">
        <h2 className="font-semibold mb-3">
          {locale === "nl" ? "Bijlagen & downloads" : "Attachments & downloads"}
        </h2>
        <ul className="divide-y divide-zinc-200">
          {page.assets.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 gap-3">
              <div className="text-sm min-w-0">
                <div className="font-medium truncate">{a.labelNl}</div>
                <div className="text-xs text-zinc-500 truncate">
                  {a.kind} · <a href={publicUrl(a.storageKey) ?? "#"} className="underline">{a.storageKey}</a>
                </div>
              </div>
              <form action={deletePageAssetAction}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="pageId" value={page.id} />
                <Button variant="ghost" size="sm" type="submit">
                  {locale === "nl" ? "Verwijderen" : "Remove"}
                </Button>
              </form>
            </li>
          ))}
          {page.assets.length === 0 && (
            <li className="py-4 text-sm text-zinc-500">
              {locale === "nl" ? "Nog geen bijlagen." : "No attachments yet."}
            </li>
          )}
        </ul>
        <FileUploader pageId={page.id} locale={locale} />
      </Card>

      <form action={deletePageAction}>
        <input type="hidden" name="id" value={page.id} />
        <Button variant="danger" type="submit">
          {locale === "nl" ? "Pagina verwijderen" : "Delete page"}
        </Button>
      </form>
    </div>
  );
}
