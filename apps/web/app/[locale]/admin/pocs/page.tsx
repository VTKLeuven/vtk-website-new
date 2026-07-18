import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";
import { saveErrorMessages } from "@/lib/saveMessages";
import { STUDY_PROGRAMMES } from "@/lib/profile";
import { PocsTable, type PocRow } from "./PocsTable";

export default async function AdminPocs({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("pocs.manage");
  const dict = getDictionary(locale);

  // Enkel de POC's + hun vertegenwoordigers; de user-picker zoekt server-side
  // (/api/users/search), dus we laden de volledige gebruikerslijst niet meer.
  const pocs = await prisma.poc.findMany({
    orderBy: { order: "asc" },
    include: { representatives: { orderBy: { order: "asc" }, include: { user: true } } },
  });

  const pocRows: PocRow[] = pocs.map((poc) => {
    const reps = poc.representatives.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.user.name,
      email: r.user.email,
      avatarUrl: publicUrl(r.user.avatarKey),
      role: (nl ? r.roleNl : r.roleEn ?? r.roleNl) ?? null,
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
      description: nl ? poc.descriptionNl : poc.descriptionEn,
      descriptionNl: poc.descriptionNl ?? "",
      descriptionEn: poc.descriptionEn ?? "",
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
            ? "Aanspreekpunten per studierichting. Klik een POC open om de vertegenwoordigers te beheren."
            : "Points of contact per study track. Open a POC to manage its representatives."}
        </p>
      </div>

      <PocsTable
        pocs={pocRows}
        locale={nl ? "nl" : "en"}
        saveLabels={saveLabels}
        createLabels={createLabels}
        programmeOptions={programmeOptions}
      />
    </div>
  );
}
