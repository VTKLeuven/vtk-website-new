import { notFound } from "next/navigation";
import { Card } from "@vtk/ui";
import { type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { FakbarAdminNav } from "../FakbarAdminNav";

/** Fakbar-tab, inventaris. Nog leeg; enkel de gate en de sub-navigatie. */
export default async function AdminFakbarInventaris({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  await requirePermission("fakbar.manage");

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">
        Fakbar · {nl ? "Inventaris" : "Inventory"}
      </h1>
      <FakbarAdminNav base={base} nl={nl} active="inventaris" />

      <Card className="p-5">
        <p className="text-sm text-[#5c667f]">
          {nl
            ? "Dit scherm moet nog gebouwd worden."
            : "This screen still has to be built."}
        </p>
      </Card>
    </div>
  );
}
