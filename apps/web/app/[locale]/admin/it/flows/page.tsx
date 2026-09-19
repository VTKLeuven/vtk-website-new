import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import {
  currentStudyYear,
  formatWorkingYear,
  studyConfirmationStart,
  studyConfirmationYear,
} from "@/lib/workingYear";
import { needsStudyConfirmation } from "@vtk/auth";
import { previewNoopAction } from "@/app/actions/flowPreview";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { StudyFieldset } from "@/components/profile/StudyFieldset";
import { AddressConfirmation } from "@/components/profile/AddressConfirmation";
import { MembershipChoice } from "@/components/profile/MembershipChoice";
import { CareerOptIn } from "@/components/profile/CareerOptIn";
import { ConfirmStudySteps } from "@/components/profile/ConfirmStudySteps";
import { hasCompleteAddresses } from "@/lib/profile-address";
import { careerChoiceLabels, shouldAskCareerOptIn } from "@/lib/careerOptIn";
import "@/app/design/vtk-career-optin.css";
import {
  getMembership,
  getMembershipConfig,
  membershipChoiceLabels,
  membershipOffer,
  type MembershipOffer,
} from "@/lib/membership";
import { SaveForm } from "@/components/ui/SaveForm";
import { mailPreviewGroups } from "@/lib/mailPreviews";
import { FlowPreview } from "./FlowPreview";
import { MailPreviewList } from "./MailPreviewList";

/**
 * Voorvertoning van alles wat je op de site zelf niet te zien krijgt: de twee
 * gates (onboarding en de jaarlijkse studiebevestiging) en elke mail die de
 * site opstelt.
 *
 * Beide schermen zie je precies één keer, en daarna nooit meer. Daardoor is er
 * geen manier om te controleren of ze nog kloppen: je eigen account is al
 * onboarded, en het werkingsjaar rolt maar één keer per jaar om. Wie het toch
 * wou zien, moest een testaccount aanmaken of `onboardedAt` in de database op
 * null zetten, en dat laatste is precies hoe je per ongeluk je eigen profiel
 * wist.
 *
 * Deze pagina toont daarom **de echte formulieren**, met een opslaan-actie die
 * niets bewaart (`previewNoopAction`). Een nagebouwde kopie zou vroeg of laat
 * afwijken van wat een nieuw lid werkelijk ziet, en dan is de voorvertoning
 * erger dan geen voorvertoning.
 *
 * Voor de mails geldt hetzelfde, en om dezelfde reden: die vertrekken wanneer
 * iemand anders iets doet, soms dagen later en soms enkel op een server met een
 * mailserver erachter. `lib/mailPreviews.ts` roept per mail de echte template
 * aan met verzonnen gegevens. **Komt er een mail bij (of een scherm dat je enkel
 * onder bepaalde omstandigheden ziet), dan hoort ze daar meteen bij**; zie
 * CLAUDE.md.
 *
 * De regels erboven zijn geen documentatie maar afgeleide waarden: het huidige
 * academiejaar, de eerstvolgende omslag, en de eigen staat van de kijker.
 */
export default async function AdminFlowPreview({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";

  // Superadmin-only, net als de rest van de IT-groep.
  const session = await requireSession();
  if (!session.user.isSuperAdmin) notFound();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      email: true,
      selfRegisteredAt: true,
      name: true,
      firstName: true,
      lastName: true,
      rNumber: true,
      rNumberFromKul: true,
      avatarKey: true,
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
      birthDate: true,
      personalEmail: true,
      phone: true,
      emailPreference: true,
      mailCategories: true,
      mailUnsubscribedAt: true,
      shiftReminderDayBefore: true,
      shiftReminderSoon: true,
      calendarOnlyMyAudiences: true,
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
      onboardedAt: true,
      studyConfirmedYear: true,
    },
  });

  const dict = getDictionary(locale);
  const year = currentStudyYear();
  // De ronde loopt een week achter op de jaarnaam; de gate hangt aan de ronde.
  const confirmationYear = studyConfirmationYear();

  // Beide schermen dragen ook de lidmaatschapsvraag, dus draagt de
  // voorvertoning ze ook. Het echte aanbod hangt aan de eigen staat van de
  // kijker: wie dit academiejaar al lid is, of wiens weg gesloten staat, krijgt
  // van `membershipOffer` een `none` terug en dus geen vinkje. In een
  // voorvertoning is dat het verkeerde antwoord, want dan lijkt de vraag niet
  // te bestaan. We tonen daarom altijd de weg die bij deze kijker hoort (gratis
  // voor een student van de faculteit, betalend voor de rest) en zeggen ernaast
  // wanneer een lid ze werkelijk ziet.
  const [membership, membershipConfig] = await Promise.all([
    getMembership(session.user.id, year),
    getMembershipConfig(),
  ]);
  const offer = membershipOffer(user, membership, membershipConfig);
  const previewOffer: MembershipOffer = user.firwStudent
    ? { kind: "faculty", priceCents: 0 }
    : { kind: "external", priceCents: membershipConfig.externalPriceCents };
  const previewLabels = membershipChoiceLabels(locale, previewOffer, year);
  const membershipRule = nl
    ? "Onderaan staat de lidmaatschapsvraag: gratis voor een student van de faculteit (User.firwStudent, uit de SSO), betalend voor wie dat niet is. Ze valt weg voor wie dit academiejaar al lid is en wanneer die weg gesloten staat in /admin/leden; hieronder staat ze altijd, anders lijkt ze niet te bestaan."
    : "The membership question sits at the bottom: free for a faculty student (User.firwStudent, from SSO), paid for anyone else. It falls away for anyone who is already a member this academic year and when that route is closed in /admin/leden; below it is always shown, or it would look like it does not exist.";
  const membershipState = (
    <>
      <div className="flex justify-between gap-4">
        <dt>firwStudent</dt>
        <dd className="text-right">{user.firwStudent ? (nl ? "ja" : "yes") : nl ? "nee" : "no"}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt>{nl ? `Lid voor ${formatWorkingYear(year)}` : `Member for ${formatWorkingYear(year)}`}</dt>
        <dd className="text-right">{membership ? (nl ? "ja" : "yes") : nl ? "nee" : "no"}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt>{nl ? "Lidmaatschapsvraag" : "Membership question"}</dt>
        <dd className="text-right">
          {offer.kind === "none" ? (nl ? "nee" : "no") : nl ? "ja" : "yes"}
        </dd>
      </div>
    </>
  );

  // Dezelfde redenering voor de Career-opt-in, die enkel op de bevestiging
  // staat: wie ze ooit aanduidde krijgt ze niet meer te zien, dus zou ze uit de
  // voorvertoning verdwijnen net wanneer je ze wil nakijken.
  const askCareer = shouldAskCareerOptIn(user);
  const careerLabels = careerChoiceLabels(locale, user);
  const careerState = (
    <>
      <div className="flex justify-between gap-4">
        <dt>{nl ? "Career aangeduid" : "Career opted in"}</dt>
        <dd className="text-right">
          {user.mailCategories.includes("CAREER") ? (nl ? "ja" : "yes") : nl ? "nee" : "no"}
        </dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt>{nl ? "Career-vraag" : "Career question"}</dt>
        <dd className="text-right">{askCareer ? (nl ? "ja" : "yes") : nl ? "nee" : "no"}</dd>
      </div>
    </>
  );

  // De eerstvolgende 21 september: dat is het moment waarop iedereen tegelijk
  // de bevestigingsgate voor zijn neus krijgt. Op de bevestigingsronde en niet
  // op het academiejaar: dat laatste is op 14 september al omgeslagen.
  const rollover = studyConfirmationStart(confirmationYear + 1).toLocaleDateString(nl ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Brussels",
  });

  const dateOrNever = (value: Date | null) =>
    value
      ? value.toLocaleDateString(nl ? "nl-BE" : "en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : nl
        ? "nooit"
        : "never";

  const previewSaved = nl
    ? "Voorbeeld: er is niets opgeslagen."
    : "Preview: nothing was saved.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-vtk-ink">
          {nl ? "Mails & schermen" : "Emails & screens"}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-[#5c667f]">
          {nl
            ? "Alles wat je op de site zelf niet te zien krijgt: de twee schermen die een lid maar één keer ziet, en elke mail die de site opstelt. Hieronder staat per stuk wanneer het verschijnt en hoe het eruitziet. Het zijn de echte formulieren en de echte templates, maar er wordt hier niets opgeslagen en er vertrekt geen mail."
            : "Everything you cannot see on the site itself: the two screens a member only ever sees once, and every email the site composes. Below is when each one appears and what it looks like. These are the real forms and the real templates, but nothing is saved here and no email is sent."}
        </p>
      </div>

      <FlowPreview
        title={nl ? "Onboarding" : "Onboarding"}
        when={
          nl
            ? "Verschijnt bij élke paginanavigatie zolang het lid zijn profiel nog niet invulde."
            : "Appears on every page navigation as long as the member has not filled in their profile."
        }
        openLabel={nl ? "Toon het formulier" : "Show the form"}
        closeLabel={nl ? "Verberg het formulier" : "Hide the form"}
        rules={
          <>
            <p className="font-medium text-vtk-ink">{nl ? "Wanneer" : "When"}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>
                {nl
                  ? "Zodra iemand voor het eerst inlogt via KU Leuven SSO of zelf een account aanmaakt: hij start met onboardedAt = null."
                  : "As soon as someone signs in with KU Leuven SSO for the first time or creates an account: they start with onboardedAt = null."}
              </li>
              <li>
                {nl
                  ? "De gate staat op de netwerkgrens (proxy.ts), niet in een layout: een redirect uit een gedeelde layout zet de router in een oneindige lus."
                  : "The gate lives at the network edge (proxy.ts), not in a layout: a redirect from a shared layout puts the router in an infinite loop."}
              </li>
              <li>
                {nl
                  ? "Enkel /privacy en /cookies blijven bereikbaar, want het formulier linkt er zelf naartoe."
                  : "Only /privacy and /cookies stay reachable, because the form itself links to them."}
              </li>
              <li>
                {nl
                  ? "Invullen stempelt onboardedAt en, enkel voor de status Student, studyConfirmedYear."
                  : "Submitting stamps onboardedAt and, only for the Student status, studyConfirmedYear."}
              </li>
              <li>{membershipRule}</li>
            </ul>
          </>
        }
        yourState={
          <>
            <p className="font-medium text-vtk-ink">{nl ? "Jouw account" : "Your account"}</p>
            <dl className="mt-2 space-y-1">
              <div className="flex justify-between gap-4">
                <dt>onboardedAt</dt>
                <dd className="text-right">{dateOrNever(user.onboardedAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>{nl ? "Gate actief" : "Gate active"}</dt>
                <dd className="text-right">
                  {user.onboardedAt ? (nl ? "nee" : "no") : nl ? "ja" : "yes"}
                </dd>
              </div>
              {membershipState}
            </dl>
          </>
        }
      >
        <ProfileForm
          locale={locale}
          user={user}
          submitLabel={dict.onboarding.submit}
          action={previewNoopAction}
          savedMessage={previewSaved}
          showCalendarPreference={false}
          membership={{ offer: previewOffer, labels: previewLabels }}
        />
      </FlowPreview>

      <FlowPreview
        title={nl ? "Jaarlijkse studiebevestiging" : "Yearly study confirmation"}
        when={
          nl
            ? "Verschijnt na de onboarding, zodra het academiejaar omslaat en het lid zijn studie nog niet opnieuw bevestigde."
            : "Appears after onboarding, once the academic year rolls over and the member has not reconfirmed their studies."
        }
        openLabel={nl ? "Toon het formulier" : "Show the form"}
        closeLabel={nl ? "Verberg het formulier" : "Hide the form"}
        rules={
          <>
            <p className="font-medium text-vtk-ink">{nl ? "Wanneer" : "When"}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>
                {nl
                  ? `Enkel met de status Student, zodra User.studyConfirmedYear achterloopt op de lopende bevestigingsronde (${formatWorkingYear(confirmationYear)}). Het lopende academiejaar is ${formatWorkingYear(year)}.`
                  : `Only with the Student status, as soon as User.studyConfirmedYear lags behind the running confirmation round (${formatWorkingYear(confirmationYear)}). The current academic year is ${formatWorkingYear(year)}.`}
              </li>
              <li>
                {nl
                  ? `Het academiejaar rolt om op 14 september, na de herexamens; de bevestigingsronde opent een week later op 21 september, zodat niemand geblokkeerd wordt voor de eerste lesweek. De eerstvolgende omslag is ${rollover}; dan krijgen alle studenten dit scherm.`
                  : `The academic year rolls over on 14 September, after the resits; the confirmation round opens a week later on 21 September, so nobody is blocked before the first week of classes. The next rollover is ${rollover}; all students then get this screen.`}
              </li>
              <li>
                {nl
                  ? "De vorige studiegegevens en adressen staan voorgevuld: bevestigen blijft snel voor wie niets wijzigt."
                  : "The previous study details and addresses are prefilled, so confirming stays quick when nothing changed."}
              </li>
              <li>
                {nl
                  ? "Wie hier niet bevestigt, valt uit elke studiegerichte mailinglijst. Alumni, personeel en andere niet-studenten krijgen deze gate niet."
                  : "Anyone who does not confirm falls out of every study-related mailing list. Alumni, staff and other non-students do not get this gate."}
              </li>
              <li>
                {nl
                  ? "Het lid ziet dit in twee stappen: eerst studie en adressen, dan het lidmaatschap en Career, met één keer versturen op het einde. Hieronder staan beide stappen onder elkaar."
                  : "The member sees this in two steps: studies and addresses first, then membership and Career, submitted once at the end. Below, both steps are shown one after another."}
              </li>
              <li>{membershipRule}</li>
              <li>
                {nl
                  ? "Daaronder staat de Career-opt-in: één vinkje voor de mailinglijst Career, niet voor de andere categorieën. We vragen ze enkel aan wie ze nog nooit aanduidde; ook wie zich via een mail uitschreef of buiten de faculteit studeert krijgt ze niet, want hun aanduiding zou geen mail opleveren. Hieronder staat ze altijd."
                  : "Below that sits the Career opt-in: one checkbox for the Career mailing list, not for the other categories. We only ask it of anyone who never ticked it; anyone who unsubscribed by email or studies outside the faculty does not get it either, as their tick would never produce a mail. Below it is always shown."}
              </li>
            </ul>
          </>
        }
        yourState={
          <>
            <p className="font-medium text-vtk-ink">{nl ? "Jouw account" : "Your account"}</p>
            <dl className="mt-2 space-y-1">
              <div className="flex justify-between gap-4">
                <dt>isStudent</dt>
                <dd className="text-right">{user.isStudent ? (nl ? "ja" : "yes") : nl ? "nee" : "no"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>studyConfirmedYear</dt>
                <dd className="text-right">
                  {user.studyConfirmedYear
                    ? formatWorkingYear(user.studyConfirmedYear)
                    : nl
                      ? "nooit"
                      : "never"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>{nl ? "Huidig academiejaar" : "Current academic year"}</dt>
                <dd className="text-right">{formatWorkingYear(year)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>{nl ? "Gate actief" : "Gate active"}</dt>
                <dd className="text-right">
                  {needsStudyConfirmation(user) ? (nl ? "ja" : "yes") : nl ? "nee" : "no"}
                </dd>
              </div>
              {membershipState}
              {careerState}
            </dl>
          </>
        }
      >
        {/* Hetzelfde fieldset als /studie-bevestigen, met dezelfde name-attributen:
            zo blijft deze voorvertoning vanzelf gelijklopen met het echte scherm. */}
        <SaveForm
          action={previewNoopAction}
          className="space-y-6"
          submitLabel={dict.confirmStudy.submit}
          savingLabel={dict.common.saving}
          savedMessage={previewSaved}
          fallbackErrorMessage={dict.common.saveError}
          resetOnSuccess={false}
        >
          <p className="text-sm text-[#34405e]">{dict.confirmStudy.intro}</p>
          {/* Dezelfde twee stappen als op het echte scherm, maar onder elkaar:
              `SaveForm` bezit hier het formulier en de submitknop, en een
              beheerder wil de volledige inhoud zien zonder door te klikken. */}
          <ConfirmStudySteps
            preview
            labels={{
              stepOf: dict.confirmStudy.stepOf,
              continueLabel: dict.confirmStudy.continueLabel,
              backLabel: dict.confirmStudy.back,
              submitLabel: dict.confirmStudy.submit,
              unchangedHint: dict.confirmStudy.unchangedHint,
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
                    noKot: dict.onboarding.noKot,
                    kotAddressHeading: dict.onboarding.kotAddressHeading,
                    homeAddressHeading: dict.onboarding.homeAddressHeading,
                    homeAddressHint: dict.onboarding.homeAddressHint,
                    street: dict.onboarding.street,
                    houseNumber: dict.onboarding.houseNumber,
                    bus: dict.onboarding.bus,
                    busHint: dict.onboarding.busHint,
                    postalCode: dict.onboarding.postalCode,
                    city: dict.onboarding.city,
                  }}
                  labels={{
                    heading: dict.confirmStudy.addressesHeading,
                    question: dict.confirmStudy.addressesQuestion,
                    yes: dict.confirmStudy.addressesYes,
                    no: dict.confirmStudy.addressesNo,
                    incomplete: dict.confirmStudy.addressesIncomplete,
                    noKot: dict.confirmStudy.noKot,
                    kotAddress: dict.confirmStudy.kotAddress,
                    homeAddress: dict.confirmStudy.homeAddress,
                  }}
                />
              </>
            }
            second={
              <>
                <MembershipChoice offer={previewOffer} labels={previewLabels} />
                <CareerOptIn labels={careerLabels} photoAlt={dict.confirmStudy.careerPhotoAlt} />
              </>
            }
          />
        </SaveForm>
      </FlowPreview>

      <section className="space-y-4 pt-2">
        <div>
          <h2 className="text-xl font-semibold text-vtk-ink">
            {nl ? "Mails die de site verstuurt" : "Emails the site sends"}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-[#5c667f]">
            {nl
              ? "Elke voorvertoning roept dezelfde template aan als de verzender, met verzonnen gegevens. Wat er werkelijk verstuurd is, staat in het maillogboek."
              : "Every preview calls the same template as the sender, with made-up data. What was actually sent is in the email log."}
          </p>
        </div>
        <MailPreviewList groups={mailPreviewGroups()} />
      </section>

      {/* De echte schermen, voor wie wil zien hoe ze in hun eigen paginakader
          staan. Enkel zinvol wanneer de gate voor jou actief is; anders stuurt
          de pagina je meteen door naar home. */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-[#5c667f]">
        <span>{nl ? "De echte schermen:" : "The real screens:"}</span>
        <a
          href={`${nl ? "" : "/en"}/onboarding`}
          className="rounded-full border border-vtk-blue/15 px-3 py-1.5 font-medium text-vtk-ink transition-colors hover:bg-vtk-blue-soft/70"
        >
          /onboarding
        </a>
        <a
          href={`${nl ? "" : "/en"}/studie-bevestigen`}
          className="rounded-full border border-vtk-blue/15 px-3 py-1.5 font-medium text-vtk-ink transition-colors hover:bg-vtk-blue-soft/70"
        >
          /studie-bevestigen
        </a>
        <span>
          {nl
            ? "(die sturen je door naar home wanneer de gate voor jou niet actief is)"
            : "(these redirect you home when the gate is not active for you)"}
        </span>
      </div>
    </div>
  );
}
