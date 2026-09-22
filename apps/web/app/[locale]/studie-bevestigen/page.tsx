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
import { ConfirmStudySteps } from "@/components/profile/ConfirmStudySteps";
import { hasCompleteAddresses } from "@/lib/profile-address";
import { careerFitsStudy, careerOptInOpen } from "@/lib/careerOptIn";
import { careerOptInCopy } from "@/lib/careerOptInCopy";
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
 * hierheen zodra `studyConfirmedYear` achterloopt op de bevestigingsronde, die
 * op 21 september opengaat. Het academiejaar zelf heet al een week eerder
 * 26-27; zie `lib/workingYear.ts` voor de drie grenzen.
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
  // `lib/careerOptIn.ts` voor de gevallen waarin ze wegvalt. Wat van de studie
  // afhangt, beslist het blok zelf op wat het lid in stap 1 invult: het profiel
  // hier is nog dat van vorig jaar.
  const careerOpen = careerOptInOpen(user);
  const careerStudy = {
    isStudent: user.isStudent,
    notAtFaculty: user.notAtFaculty,
    studyYears: user.studyYears,
    studyProgrammes: user.studyProgrammes,
  };

  return (
    <div className="vtk-page vtk-page-shell vtk-page-narrow space-y-6">
      <div>
        <div className="vtk-page-kicker">{formatWorkingYear(year)}</div>
        <h1 className="text-4xl font-semibold tracking-tight text-vtk-ink">{t.title}</h1>
        <p className="mt-2 max-w-2xl text-[#34405e]">{t.intro}</p>
      </div>

      <Card className="p-6">
        {/* Twee stappen: eerst studie en adressen, dan het lidmaatschap en
            Career. Eén formulier, dus alles vertrekt in één POST; zie
            ConfirmStudySteps. */}
        <ConfirmStudySteps
          action={confirmStudyAction}
          next={home}
          labels={{
            stepOf: t.stepOf,
            continueLabel: t.continueLabel,
            backLabel: t.back,
            submitLabel: t.submit,
            unchangedHint: t.unchangedHint,
          }}
          first={
            <>
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
            </>
          }
          second={
            // Een tweede stap zonder vraag erop is een extra klik voor niets:
            // wie al lid is én Career al aanduidde, houdt één pagina.
            offer.kind !== "none" || careerOpen ? (
              <>
                <MembershipChoice
                  offer={offer}
                  labels={membershipChoiceLabels(locale, offer, year)}
                />
                <CareerOptIn
                  copy={careerOpen ? careerOptInCopy(locale) : null}
                  initial={careerStudy}
                  photoAlt={t.careerPhotoAlt}
                />
              </>
            ) : null
          }
          // Of stap 2 bij het laden al iets toont; de Career-vraag kan pas
          // verschijnen wanneer het lid in stap 1 zijn nieuwe jaar aanduidt.
          secondVisible={offer.kind !== "none" || (careerOpen && careerFitsStudy(careerStudy))}
        />
      </Card>

      <form action={logoutAction}>
        <Button variant="ghost" type="submit">
          {getDictionary(locale).auth.signOut}
        </Button>
      </form>
    </div>
  );
}
