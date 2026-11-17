import { Suspense } from "react";
import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";
import { saveErrorMessages } from "@/lib/saveMessages";
import { STUDY_PROGRAMMES } from "@/lib/profile";
import { formatWorkingYear, parseWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { POC_BAND_SETTING, readPocBandSetting } from "@/lib/home/pocBand";
import { discordGuildConfigured, listDiscordChannels } from "@/lib/discord/bot";
import { discordAccessStatus } from "@/lib/discord/pocAccess";
import { PocsTable, type PocRow } from "./PocsTable";
import { PocBandAdminCard } from "./PocBandAdminCard";
import { PocDiscordCard, PocDiscordCardPending } from "./PocDiscordCard";
import { PocMailCard } from "./PocMailCard";
import { currentWorkingYear } from "@vtk/auth";

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
  const session = await requirePermission("pocs.manage");
  const dict = getDictionary(locale);

  const year = parseWorkingYear(jaar);

  // Enkel de POC's + hun vertegenwoordigers van het geselecteerde werkingsjaar;
  // de user-picker zoekt server-side (/api/users/search).
  //
  // Niets van Discord hier: dat zijn aanroepen over het net, en ze hielden het
  // laden van de hele pagina op. De rollen komen pas wanneer je een POC
  // openklapt, de kaart met het koppelbericht in haar eigen Suspense.
  const [pocs, distinctYears, pocBandSettingRow] = await Promise.all([
    prisma.poc.findMany({
      orderBy: { order: "asc" },
      include: {
        discordRoles: { select: { roleId: true, studyYears: true } },
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
    prisma.setting.findUnique({
      where: { key: POC_BAND_SETTING },
    }),
  ]);

  // Welke POC een groepsadres heeft dat haar vertegenwoordigers volgt.
  const pocLists = await prisma.mailGroupSource.findMany({
    where: { pocId: { not: null } },
    select: { pocId: true, mailGroupId: true, mailGroup: { select: { email: true } } },
  });
  const listByPoc = new Map(
    pocLists.map((s) => [s.pocId as string, { id: s.mailGroupId, email: s.mailGroup.email }]),
  );

  const pocBandSetting = readPocBandSetting(pocBandSettingRow?.value);
  const discordEnabled = discordGuildConfigured();

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "POC's" : "POCs"}</h1>
        <p className="mt-1 text-sm text-[#5c667f]">
          {nl
            ? "Aanspreekpunten per studierichting. Klik een POC open om de vertegenwoordigers te beheren. Vertegenwoordigers gelden per werkingsjaar."
            : "Points of contact per study track. Open a POC to manage its representatives. Representatives apply per working year."}
        </p>
      </div>

      <PocBandAdminCard setting={pocBandSetting} locale={locale} />

      {discordEnabled ? (
        <Suspense fallback={<PocDiscordCardPending nl={nl} />}>
          <PocDiscordSection nl={nl} />
        </Suspense>
      ) : null}

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

      <PocMailCard
        nl={nl}
        year={year}
        canCreateLists={session.user.isSuperAdmin || session.permissions.includes("mailgroups.manage")}
        groupsBase={`${base}/admin/groepsadressen`}
        rows={pocs.map((poc) => ({
          id: poc.id,
          name: nl ? poc.nameNl : (poc.nameEn ?? poc.nameNl),
          email: poc.email,
          mailYear: poc.mailYear ?? currentWorkingYear(),
          repsInYear: poc.representatives.length,
          linkedList: listByPoc.get(poc.id) ?? null,
        }))}
      />

      <PocsTable
        pocs={pocRows}
        year={year}
        locale={nl ? "nl" : "en"}
        saveLabels={saveLabels}
        createLabels={createLabels}
        programmeOptions={programmeOptions}
        discordEnabled={discordEnabled}
      />
    </div>
  );
}

/**
 * Het koppelbericht en hoe de rollen ervoor staan. Twee aanroepen naar Discord en
 * een telling over alle gekoppelde accounts: in een eigen Suspense, zodat de rest
 * van de pagina er niet op wacht.
 */
async function PocDiscordSection({ nl }: { nl: boolean }) {
  const [channels, status] = await Promise.all([listDiscordChannels(), discordAccessStatus()]);
  if (!channels) return null;
  return <PocDiscordCard locale={nl ? "nl" : "en"} status={status} channels={channels} />;
}
