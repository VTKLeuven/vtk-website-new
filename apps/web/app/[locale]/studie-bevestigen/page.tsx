import type { Metadata } from "next";
import { staticMetadata } from "@/lib/pageMetadata";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card, Button } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { currentStudyYear, formatWorkingYear } from "@/lib/workingYear";
import { needsStudyConfirmation } from "@vtk/auth";
import { logoutAction } from "@/app/actions/auth";
import { confirmStudyAction } from "@/app/actions/onboarding";
import { StudyFieldset } from "@/components/profile/StudyFieldset";
import { AddressConfirmation } from "@/components/profile/AddressConfirmation";
import { MembershipChoice } from "@/components/profile/MembershipChoice";
import { CareerOptIn } from "@/components/profile/CareerOptIn";
import { hasCompleteAddresses } from "@/lib/profile-address";
import { careerChoiceLabels, shouldAskCareerOptIn } from "@/lib/careerOptIn";
import "@/app/design/vtk-career-optin.css";
import {
  getMembership,
  getMembershipConfig,
  membershipChoiceLabels,
  membershipOffer,
} from "@/lib/membership";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("confirmStudy", "/studie-bevestigen", locale, { noIndex: true });
}

/**
 * Jaarlijkse bevestiging van het studieprofiel. De gate in `proxy.ts` stuurt
 * hierheen zodra `studyConfirmedYear` achterloopt op het academiejaar (de
 * cutover ligt op 21 september, zie `lib/workingYear.ts`).
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
  const year = currentStudyYear();
  // Al bevestigd (of nog niet door de onboarding): niets te doen hier.
  if (!session.user.onboarded) redirect(locale === "en" ? "/en/onboarding" : "/onboarding");
  if (!needsStudyConfirmation(session.user)) redirect(home);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      studyYears: true,
      studyProgrammes: true,
      isStudent: true,
      firwStudent: true,
      notAtFaculty: true,
      notStudying: true,
      academicStaffRole: true,
      internationalStudent: true,
      alumni: true,
      graduationYear: true,
      wasInVtk: true,
      alumniMailOptIn: true,
      mailCategories: true,
      mailUnsubscribedAt: true,
      noKot: true,
      street: true,
      houseNumber: true,
      bus: true,
      postalCode: true,
      city: true,
      homeStreet: true,
      homeHouseNumber: true,
      homeBus: true,
      homePostalCode: true,
      homeCity: true,
    },
  });

  const dict = getDictionary(locale);
  const t = dict.confirmStudy;
  const addressT = dict.onboarding;

  // Het lidmaatschap hangt aan hetzelfde academiejaar als deze bevestiging, dus
  // wordt het hier gevraagd en niet op een scherm dat niemand uit zichzelf opent.
  const [membership, membershipConfig] = await Promise.all([
    getMembership(session.user.id, year),
    getMembershipConfig(),
  ]);
  const offer = membershipOffer(user, membership, membershipConfig);

  // De Career-vraag stellen we enkel aan wie ze nog niet beantwoordde; zie
  // `lib/careerOptIn.ts` voor de drie gevallen waarin ze wegvalt.
  const askCareer = shouldAskCareerOptIn(user);

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
            isStudent={user.isStudent}
            notAtFaculty={user.notAtFaculty}
            notStudying={user.notStudying}
            academicStaffRole={user.academicStaffRole}
            internationalStudent={user.internationalStudent}
            alumni={user.alumni}
            graduationYear={user.graduationYear}
            wasInVtk={user.wasInVtk}
            alumniMailOptIn={user.alumniMailOptIn}
          />
          <AddressConfirmation
            values={user}
            complete={hasCompleteAddresses(user)}
            addressLabels={{
              noKot: addressT.noKot,
              kotAddressHeading: addressT.kotAddressHeading,
              homeAddressHeading: addressT.homeAddressHeading,
              homeAddressHint: addressT.homeAddressHint,
              street: addressT.street,
              houseNumber: addressT.houseNumber,
              bus: addressT.bus,
              busHint: addressT.busHint,
              postalCode: addressT.postalCode,
              city: addressT.city,
            }}
            labels={{
              heading: t.addressesHeading,
              question: t.addressesQuestion,
              yes: t.addressesYes,
              no: t.addressesNo,
              incomplete: t.addressesIncomplete,
              noKot: t.noKot,
              kotAddress: t.kotAddress,
              homeAddress: t.homeAddress,
            }}
          />
          <MembershipChoice offer={offer} labels={membershipChoiceLabels(locale, offer, year)} />
          <CareerOptIn
            labels={askCareer ? careerChoiceLabels(locale, user) : null}
            photoAlt={t.careerPhotoAlt}
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
