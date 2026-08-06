import { notFound } from "next/navigation";
import { Card } from "@vtk/ui";
import { type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { FakbarAdminNav } from "../FakbarAdminNav";

/** Fakbar-tab, weekoverzichten. Nog leeg; enkel de gate en de sub-navigatie. */
export default async function AdminFakbarWeekoverzichten({
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
        Fakbar · {nl ? "Weekoverzichten" : "Weekly overviews"}
      </h1>
      <FakbarAdminNav base={base} nl={nl} active="weekoverzichten" />

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
