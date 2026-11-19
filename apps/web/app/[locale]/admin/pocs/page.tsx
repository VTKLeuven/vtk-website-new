import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";
import { saveErrorMessages } from "@/lib/saveMessages";
import { STUDY_PROGRAMMES } from "@/lib/profile";
import { parseWorkingYear } from "@/lib/workingYear";
import { discordGuildConfigured } from "@/lib/discord/bot";
import { PocsTable, type PocRow } from "./PocsTable";
import { PocYearTabs } from "./PocYearTabs";

/**
 * Tabblad POC's: de POC's en hun vertegenwoordigers van één werkingsjaar.
 *
 * Niets van Discord hier: dat zijn aanroepen over het net, en ze hielden het
 * laden van de hele pagina op. De rollen komen pas wanneer je een POC
 * openklapt; het koppelbericht staat op het tabblad Discord.
 */
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

  // Enkel de vertegenwoordigers van het geselecteerde werkingsjaar; de
  // user-picker zoekt server-side (/api/users/search).
  const pocs = await prisma.poc.findMany({
    orderBy: { order: "asc" },
    include: {
      discordRoles: { select: { roleId: true, studyYears: true } },
      representatives: {
        where: { year },
        orderBy: { order: "asc" },
        include: { user: true },
      },
    },
  });

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
      discordRoles: poc.discordRoles,
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
    <div className="space-y-5">
      <PocYearTabs year={year} href={(y) => `${base}/admin/pocs?jaar=${y}`} />
      <PocsTable
        pocs={pocRows}
        year={year}
        locale={nl ? "nl" : "en"}
        saveLabels={saveLabels}
        createLabels={createLabels}
        programmeOptions={programmeOptions}
        discordEnabled={discordGuildConfigured()}
      />
    </div>
  );
}
