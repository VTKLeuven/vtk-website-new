import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { PageEditor } from "../PageEditor";
import type { Locale } from "@vtk/i18n";

export default async function NewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("pages.edit");
  const tabs = await prisma.headerTab.findMany({ orderBy: { order: "asc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{locale === "nl" ? "Nieuwe pagina" : "New page"}</h1>
      <PageEditor page={{}} headerTabs={tabs} locale={locale} />
    </div>
  );
}
