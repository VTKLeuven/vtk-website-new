import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import { previewNoopAction } from "@/app/actions/flowPreview";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { StudyFieldset } from "@/components/profile/StudyFieldset";
import { SaveForm } from "@/components/ui/SaveForm";
import { FlowPreview } from "./FlowPreview";

/**
 * Voorvertoning van de twee gates: de onboarding en de jaarlijkse
 * studiebevestiging.
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
 * De regels erboven zijn geen documentatie maar afgeleide waarden: het huidige
 * werkingsjaar, de eerstvolgende omslag, en de eigen staat van de kijker.
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
      name: true,
      firstName: true,
      lastName: true,
      rNumber: true,
      rNumberFromKul: true,
      avatarKey: true,
      street: true,
      houseNumber: true,
      bus: true,
      postalCode: true,
      city: true,
      birthDate: true,
      personalEmail: true,
      emailPreference: true,
      mailCategories: true,
      shiftReminderDayBefore: true,
      shiftReminderSoon: true,
      calendarOnlyMyAudiences: true,
      studyYears: true,
      studyProgrammes: true,
      notAtFaculty: true,
      notStudying: true,
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
  const year = currentWorkingYear();

  // De eerstvolgende 15 juli: dat is het moment waarop iedereen tegelijk de
  // bevestigingsgate voor zijn neus krijgt.
  const now = new Date();
  const rolloverYear = now < new Date(now.getFullYear(), 6, 15) ? now.getFullYear() : now.getFullYear() + 1;
  const rollover = new Date(rolloverYear, 6, 15).toLocaleDateString(nl ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
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
          {nl ? "Onboarding & jaarlijkse bevestiging" : "Onboarding & yearly confirmation"}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-[#5c667f]">
          {nl
            ? "De twee schermen die een lid maar één keer ziet. Hieronder staat wanneer ze verschijnen en hoe ze eruitzien; het zijn de echte formulieren, maar de opslaan-knop bewaart hier niets. Je eigen profiel en je studiebevestiging blijven dus ongemoeid."
            : "The two screens a member only ever sees once. Below is when they appear and what they look like; these are the real forms, but the save button stores nothing here. Your own profile and study confirmation stay untouched."}
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
                  ? "Invullen stempelt onboardedAt én studyConfirmedYear; de tweede gate hieronder valt daarmee meteen weg."
                  : "Submitting stamps onboardedAt and studyConfirmedYear; the second gate below therefore falls away at once."}
              </li>
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
        />
      </FlowPreview>

      <FlowPreview
        title={nl ? "Jaarlijkse studiebevestiging" : "Yearly study confirmation"}
        when={
          nl
            ? "Verschijnt na de onboarding, zodra het werkingsjaar omslaat en het lid zijn studie nog niet opnieuw bevestigde."
            : "Appears after onboarding, once the working year rolls over and the member has not reconfirmed their studies."
        }
        openLabel={nl ? "Toon het formulier" : "Show the form"}
        closeLabel={nl ? "Verberg het formulier" : "Hide the form"}
        rules={
          <>
            <p className="font-medium text-vtk-ink">{nl ? "Wanneer" : "When"}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>
                {nl
                  ? `Zodra User.studyConfirmedYear achterloopt op het huidige werkingsjaar (${formatWorkingYear(year)}).`
                  : `As soon as User.studyConfirmedYear lags behind the current working year (${formatWorkingYear(year)}).`}
              </li>
              <li>
                {nl
                  ? `Het werkingsjaar rolt om op 15 juli; de eerstvolgende omslag is ${rollover}. Dan krijgt iedereen dit scherm tegelijk.`
                  : `The working year rolls over on 15 July; the next one is ${rollover}. Everyone gets this screen at the same moment.`}
              </li>
              <li>
                {nl
                  ? "De vorige keuze staat voorgevuld: bevestigen is één klik voor wie niets wijzigt."
                  : "The previous choice is prefilled: confirming is a single click for anyone who changes nothing."}
              </li>
              <li>
                {nl
                  ? "Wie hier niet bevestigt, valt uit elke studiegerichte mailinglijst; wie “ik studeer niet (meer)” aanduidt ook."
                  : "Anyone who does not confirm falls out of every study-related mailing list; so does anyone ticking “I am no longer studying”."}
              </li>
            </ul>
          </>
        }
        yourState={
          <>
            <p className="font-medium text-vtk-ink">{nl ? "Jouw account" : "Your account"}</p>
            <dl className="mt-2 space-y-1">
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
                <dt>{nl ? "Huidig werkingsjaar" : "Current working year"}</dt>
                <dd className="text-right">{formatWorkingYear(year)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>{nl ? "Gate actief" : "Gate active"}</dt>
                <dd className="text-right">
                  {user.studyConfirmedYear === year ? (nl ? "nee" : "no") : nl ? "ja" : "yes"}
                </dd>
              </div>
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
          <StudyFieldset
            locale={locale}
            studyYears={user.studyYears}
            studyProgrammes={user.studyProgrammes}
            notAtFaculty={user.notAtFaculty}
            notStudying={user.notStudying}
            internationalStudent={user.internationalStudent}
            alumni={user.alumni}
            graduationYear={user.graduationYear}
            wasInVtk={user.wasInVtk}
            alumniMailOptIn={user.alumniMailOptIn}
          />
          <span className="text-xs text-[#5c667f]">{dict.confirmStudy.unchangedHint}</span>
        </SaveForm>
      </FlowPreview>

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
