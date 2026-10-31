import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { readSlogansSetting } from "@/lib/slogans";
import { SlogansEditor } from "./SlogansEditor";

export default async function AdminSlogans({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("home.edit");

  const row = await prisma.setting.findUnique({
    where: { key: "home.slogans" },
  });
  const config = readSlogansSetting(row?.value);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{locale === "nl" ? "Slogans" : "Slogans"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {locale === "nl"
            ? "De titel in de hero van de homepage. Eén lijst: een begroeting voor aangemelde leden opent de reeks, daarna roteren de slogans. Het gele accent zet je tussen sterretjes."
            : "The headline in the homepage hero. One list: a greeting for signed-in members opens the sequence, then the slogans rotate. Put the yellow accent between asterisks."}
        </p>
      </header>

      <SlogansEditor locale={locale} initialConfig={config} />
    </div>
  );
}
