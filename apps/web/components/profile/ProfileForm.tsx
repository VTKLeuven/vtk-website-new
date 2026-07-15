import type { User } from "@prisma/client";
import { Input, Label } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { nameParts } from "@vtk/auth";
import { publicUrl } from "@/lib/storage";
import { MAIL_CATEGORIES, R_NUMBER_PATTERN } from "@/lib/profile";
import { CheckboxChip, StudyFieldset } from "./StudyFieldset";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveProfileAction, type ProfileErrorCode } from "@/app/actions/onboarding";

function dateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

/**
 * Onboarding / account profile form. Renders the kot address, birth date,
 * contact emails + communication preference + opt-in mailing lists, the study
 * years and programmes, and an optional profile picture. Posts to
 * {@link saveProfileAction} via {@link SaveForm}, dat de uitkomst als toast
 * toont. Pass `next` to redirect after saving (onboarding); omit it to stay on
 * the page (account), waar de toast de enige bevestiging is.
 */
export function ProfileForm({
  locale,
  user,
  next,
  submitLabel,
}: {
  locale: Locale;
  user: Pick<
    User,
    | "email"
    | "name"
    | "firstName"
    | "lastName"
    | "rNumber"
    | "avatarKey"
    | "street"
    | "houseNumber"
    | "bus"
    | "postalCode"
    | "city"
    | "birthDate"
    | "personalEmail"
    | "emailPreference"
    | "mailCategories"
    | "studyYears"
    | "studyProgrammes"
    | "notAtFaculty"
  >;
  next?: string;
  submitLabel: string;
}) {
  const t = getDictionary(locale).onboarding;
  const currentAvatar = publicUrl(user.avatarKey);
  // Leden die de onboarding nog niet doorliepen hebben enkel een weergavenaam;
  // die splitsen we als startwaarde zodat ze ze meteen kunnen corrigeren.
  const { firstName, lastName } = nameParts(user);
  const selectedCategories = new Set(user.mailCategories);

  const common = getDictionary(locale).common;
  const errorMessages: Record<ProfileErrorCode, string> = {
    INVALID_PROFILE: t.errorInvalid,
    RNUMBER_TAKEN: t.errorRnumberTaken,
    AVATAR_TOO_LARGE: t.errorAvatarTooLarge,
    AVATAR_FAILED: t.errorAvatarFailed,
  };

  return (
    <SaveForm
      action={saveProfileAction}
      className="space-y-8"
      submitLabel={submitLabel}
      savingLabel={common.saving}
      savedMessage={t.saved}
      errorMessages={errorMessages}
      fallbackErrorMessage={common.saveError}
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {/* Naam & studentennummer */}
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-vtk-ink">{t.identityHeading}</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="firstName">{t.firstName}</Label>
            <Input id="firstName" name="firstName" defaultValue={firstName} required />
          </div>
          <div>
            <Label htmlFor="lastName">{t.lastName}</Label>
            <Input id="lastName" name="lastName" defaultValue={lastName} required />
          </div>
          <div>
            <Label htmlFor="rNumber">{t.rNumber}</Label>
            <Input
              id="rNumber"
              name="rNumber"
              defaultValue={user.rNumber ?? ""}
              placeholder="r0123456"
              pattern={R_NUMBER_PATTERN}
              title={t.rNumberHint}
            />
            <p className="mt-1 text-xs text-[#5c667f]">{t.rNumberHint}</p>
          </div>
        </div>
      </fieldset>

      {/* Kotadres */}
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-vtk-ink">{t.addressHeading}</legend>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <Label htmlFor="street">{t.street}</Label>
            <Input id="street" name="street" defaultValue={user.street ?? ""} required />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="houseNumber">{t.houseNumber}</Label>
            <Input id="houseNumber" name="houseNumber" defaultValue={user.houseNumber ?? ""} required />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="bus" className="whitespace-nowrap">
              {t.bus} <span className="text-xs text-[#5c667f]">({t.busHint})</span>
            </Label>
            <Input id="bus" name="bus" defaultValue={user.bus ?? ""} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="postalCode">{t.postalCode}</Label>
            <Input id="postalCode" name="postalCode" defaultValue={user.postalCode ?? ""} required />
          </div>
          <div className="sm:col-span-4">
            <Label htmlFor="city">{t.city}</Label>
            <Input id="city" name="city" defaultValue={user.city ?? ""} required />
          </div>
        </div>
        <div className="sm:max-w-xs">
          <Label htmlFor="birthDate">{t.birthDate}</Label>
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            defaultValue={dateInputValue(user.birthDate)}
            required
          />
        </div>
      </fieldset>

      {/* Contact & voorkeur */}
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-vtk-ink">{t.contactHeading}</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="universityEmail">{t.universityEmail}</Label>
            <Input id="universityEmail" defaultValue={user.email} disabled />
            <p className="mt-1 text-xs text-[#5c667f]">{t.universityEmailHint}</p>
          </div>
          <div>
            <Label htmlFor="personalEmail">{t.personalEmail}</Label>
            <Input
              id="personalEmail"
              name="personalEmail"
              type="email"
              defaultValue={user.personalEmail ?? ""}
              required
            />
          </div>
        </div>
        <div>
          <span className="text-sm font-medium text-vtk-ink">{t.preferenceHeading}</span>
          <p className="text-xs text-[#5c667f]">{t.preferenceHint}</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="emailPreference"
                value="UNIVERSITY"
                defaultChecked={user.emailPreference !== "PERSONAL"}
              />
              {t.preferenceUniversity}
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="emailPreference"
                value="PERSONAL"
                defaultChecked={user.emailPreference === "PERSONAL"}
              />
              {t.preferencePersonal}
            </label>
          </div>
        </div>
        {/* Mailinglijsten (opt-in) horen bij de contactgegevens. */}
        <div>
          <span className="text-sm font-medium text-vtk-ink">{t.mailHeading}</span>
          <p className="text-xs text-[#5c667f]">{t.mailIntro}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MAIL_CATEGORIES.map((cat) => (
              <CheckboxChip
                key={cat}
                name="mailCategories"
                value={cat}
                defaultChecked={selectedCategories.has(cat)}
                label={t.categories[cat]}
              />
            ))}
          </div>
        </div>
      </fieldset>

      {/* Studie: studiejaren + richtingen */}
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-vtk-ink">{t.studyHeading}</legend>
        <StudyFieldset
          locale={locale}
          studyYears={user.studyYears}
          studyProgrammes={user.studyProgrammes}
          notAtFaculty={user.notAtFaculty}
        />
      </fieldset>

      {/* Profielfoto */}
      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold text-vtk-ink">{t.photoHeading}</legend>
        <p className="text-sm text-[#5c667f]">{t.photoHint}</p>
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[16px] border border-vtk-blue/10 bg-[#f2f0e9]">
            {currentAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentAvatar} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <input
            type="file"
            name="photo"
            accept="image/*"
            className="text-sm text-[#34405e] file:mr-3 file:rounded-full file:border-0 file:bg-vtk-ink file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
          />
        </div>
      </fieldset>
    </SaveForm>
  );
}
