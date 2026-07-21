import { notFound, redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card, Button } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import { logoutAction } from "@/app/actions/auth";
import { confirmStudyAction } from "@/app/actions/onboarding";
import { StudyFieldset } from "@/components/profile/StudyFieldset";

/**
 * Jaarlijkse bevestiging van het studieprofiel. De gate in `[locale]/layout.tsx`
 * stuurt hierheen zodra `studyConfirmedYear` achterloopt op het werkingsjaar.
 *
 * De vorige keuze staat voorgevuld, zodat bevestigen één klik is voor wie niets
 * wijzigt; dat is het verschil tussen een lid dat bevestigt en een lid dat
 * afhaakt.
 */
export default async function ConfirmStudyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const home = locale === "en" ? "/en" : "/";

  const session = await requireSession(
    `/inloggen?next=${locale === "en" ? "/en" : ""}/studie-bevestigen`
  );
  const year = currentWorkingYear();
  // Al bevestigd (of nog niet door de onboarding): niets te doen hier.
  if (!session.user.onboarded) redirect(locale === "en" ? "/en/onboarding" : "/onboarding");
  if (session.user.studyConfirmedYear === year) redirect(home);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      studyYears: true,
      studyProgrammes: true,
      notAtFaculty: true,
      notStudying: true,
    },
  });

  const t = getDictionary(locale).confirmStudy;

  return (
    <div className="vtk-page vtk-page-shell vtk-page-narrow space-y-6">
      <div>
        <div className="vtk-page-kicker">{formatWorkingYear(year)}</div>
        <h1 className="text-4xl font-semibold tracking-tight text-vtk-ink">{t.title}</h1>
        <p className="mt-2 max-w-2xl text-[#34405e]">{t.intro}</p>
      </div>

      <Card className="p-6">
        <form action={confirmStudyAction} className="space-y-6">
          <input type="hidden" name="next" value={home} />
          <StudyFieldset
            locale={locale}
            studyYears={user.studyYears}
            studyProgrammes={user.studyProgrammes}
            notAtFaculty={user.notAtFaculty}
            notStudying={user.notStudying}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit">{t.submit}</Button>
            <span className="text-xs text-[#5c667f]">{t.unchangedHint}</span>
          </div>
        </form>
      </Card>

      <form action={logoutAction}>
        <Button variant="ghost" type="submit">
          {getDictionary(locale).auth.signOut}
        </Button>
      </form>
    </div>
  );
}
