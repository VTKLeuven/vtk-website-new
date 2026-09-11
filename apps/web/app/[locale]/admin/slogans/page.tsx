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
        <h1 className="text-2xl font-semibold">
          {locale === "nl" ? "Landing page slogans" : "Landing page slogans"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {locale === "nl"
            ? "Beheer de slogan en de roterende ('rolling') slogans op de startpagina. Geef telkens het gele accentwoord op en stel eventueel een persoonlijke slogan in voor ingelogde leden."
            : "Manage the headline and rotating ('rolling') slogans on the homepage. Configure the yellow accent word for each slogan and optionally set a personalized greeting for logged-in members."}
        </p>
      </header>

      <SlogansEditor locale={locale} initialConfig={config} />
    </div>
  );
}
