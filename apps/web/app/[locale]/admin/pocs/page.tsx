import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";
import { saveErrorMessages } from "@/lib/saveMessages";
import { STUDY_PROGRAMMES } from "@/lib/profile";
import { formatWorkingYear, parseWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { PocsTable, type PocRow } from "./PocsTable";

export default async function AdminPocs({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale: localeParam } = await params;
  const { jaar } = await searchParams;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  await requirePermission("pocs.manage");
  const dict = getDictionary(locale);

  const year = parseWorkingYear(jaar);

  // Enkel de POC's + hun vertegenwoordigers van het geselecteerde werkingsjaar;
  // de user-picker zoekt server-side (/api/users/search).
  const [pocs, distinctYears] = await Promise.all([
    prisma.poc.findMany({
      orderBy: { order: "asc" },
      include: {
        representatives: {
          where: { year },
          orderBy: { order: "asc" },
          include: { user: true },
        },
      },
    }),
    prisma.pocRepresentative.findMany({
      distinct: ["year"],
      select: { year: true },
    }),
  ]);

  const tabs = workingYearTabs(distinctYears.map((r) => r.year));

  const pocRows: PocRow[] = pocs.map((poc) => {
    const reps = poc.representatives.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.user.name,
      email: r.user.email,
      avatarUrl: publicUrl(r.user.avatarKey),
    }));
    const name = nl ? poc.nameNl : poc.nameEn ?? poc.nameNl;

    const searchText = [name, poc.nameNl, poc.nameEn ?? "", poc.slug, ...reps.map((r) => `${r.name} ${r.email}`)]
      .join(" ")
      .toLowerCase();

    return {
      id: poc.id,
      slug: poc.slug,
      name,
      nameNl: poc.nameNl,
      nameEn: poc.nameEn ?? "",
      email: poc.email ?? "",
      order: poc.order,
      studyProgrammes: poc.studyProgrammes,
      reps,
      searchText,
    };
  });

  // De richtingen komen van de server mee: `PocsTable` is een client component
  // en hoeft zo geen woordenboek te bundelen. Alfabetisch op label, zodat de
  // checkboxes in het beheerscherm in een voorspelbare volgorde staan.
  const programmeOptions = STUDY_PROGRAMMES.map((value) => ({
    value,
    label: dict.onboarding.programmes[value],
  })).sort((a, b) => a.label.localeCompare(b.label, locale));

  const saveLabels = {
    submitLabel: dict.admin.save,
    savingLabel: dict.common.saving,
    savedMessage: dict.common.saved,
    fallbackErrorMessage: dict.common.saveError,
    errorMessages: saveErrorMessages(locale),
  };
  const createLabels = {
    ...saveLabels,
    submitLabel: nl ? "Aanmaken" : "Create",
    savedMessage: nl ? "POC aangemaakt" : "POC created",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "POC's" : "POCs"}</h1>
        <p className="mt-1 text-sm text-[#5c667f]">
          {nl
            ? "Aanspreekpunten per studierichting. Klik een POC open om de vertegenwoordigers te beheren. Vertegenwoordigers gelden per werkingsjaar."
            : "Points of contact per study track. Open a POC to manage its representatives. Representatives apply per working year."}
        </p>
      </div>

      {/* Werkingsjaar-tabjes */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((y) => {
          const active = y === year;
          return (
            <Link
              key={y}
              href={`${base}/admin/pocs?jaar=${y}`}
              className={
                "rounded-full border px-4 py-1.5 text-sm font-medium transition " +
                (active
                  ? "border-vtk-ink bg-vtk-ink text-white"
                  : "border-vtk-blue/20 bg-white text-vtk-ink hover:bg-vtk-blue-soft/50")
              }
            >
              {formatWorkingYear(y)}
            </Link>
          );
        })}
      </div>

      <PocsTable
        pocs={pocRows}
        year={year}
        yearLabel={formatWorkingYear(year)}
        locale={nl ? "nl" : "en"}
        saveLabels={saveLabels}
        createLabels={createLabels}
        programmeOptions={programmeOptions}
      />
    </div>
  );
}
