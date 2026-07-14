import type { User } from "@prisma/client";
import { Button, Input, Label, Select } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";
import { MAIL_CATEGORIES, STUDY_YEARS, STUDY_PROGRAMMES } from "@/lib/profile";
import { saveProfileAction } from "@/app/actions/onboarding";

function dateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

/**
 * Onboarding / account profile form. Renders the kot address, birth date,
 * contact emails + communication preference, opt-in mailing lists and an
 * optional profile picture. Posts to {@link saveProfileAction}. Pass `next` to
 * redirect after saving (onboarding); omit it to stay on the page (account).
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
    | "studyYear"
    | "studyProgrammes"
  >;
  next?: string;
  submitLabel: string;
}) {
  const t = getDictionary(locale).onboarding;
  const currentAvatar = publicUrl(user.avatarKey);
  const selected = new Set(user.mailCategories);
  const selectedProgrammes = new Set(user.studyProgrammes);

  return (
    <form action={saveProfileAction} className="space-y-8">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {/* Kotadres */}
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-vtk-ink">{t.addressHeading}</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-4">
            <Label htmlFor="street">{t.street}</Label>
            <Input id="street" name="street" defaultValue={user.street ?? ""} required />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="houseNumber">{t.houseNumber}</Label>
            <Input id="houseNumber" name="houseNumber" defaultValue={user.houseNumber ?? ""} required />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="bus">
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
      </fieldset>

      {/* Studie: studiejaar + richtingen */}
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-vtk-ink">{t.studyHeading}</legend>
        <div className="sm:max-w-xs">
          <Label htmlFor="studyYear">{t.studyYearLabel}</Label>
          <Select id="studyYear" name="studyYear" defaultValue={user.studyYear ?? ""}>
            <option value="">{t.studyYearPlaceholder}</option>
            {STUDY_YEARS.map((year) => (
              <option key={year} value={year}>
                {t.years[year]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <span className="text-sm font-medium text-vtk-ink">{t.programmesLabel}</span>
          <p className="text-xs text-[#5c667f]">{t.programmesHint}</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {STUDY_PROGRAMMES.map((programme) => (
              <label
                key={programme}
                className="inline-flex items-center gap-2 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="studyProgrammes"
                  value={programme}
                  defaultChecked={selectedProgrammes.has(programme)}
                />
                {t.programmes[programme]}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      {/* Mailinglijsten (opt-in) */}
      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold text-vtk-ink">{t.mailHeading}</legend>
        <p className="text-sm text-[#5c667f]">{t.mailIntro}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MAIL_CATEGORIES.map((cat) => (
            <label
              key={cat}
              className="inline-flex items-center gap-2 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                name="mailCategories"
                value={cat}
                defaultChecked={selected.has(cat)}
              />
              {t.categories[cat]}
            </label>
          ))}
        </div>
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

      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
