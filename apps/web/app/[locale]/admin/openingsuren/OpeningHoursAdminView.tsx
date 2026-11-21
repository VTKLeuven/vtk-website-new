import { isMemberOfGroup } from "@vtk/auth";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { Card, Input, Label } from "@vtk/ui";
import { notFound } from "next/navigation";
import { saveOpeningHoursAction } from "@/app/actions/opening-hours";
import {
  BilingualGroup,
  BilingualInput,
  BilingualTextarea,
} from "@/components/admin/BilingualField";
import { SaveForm } from "@/components/ui/SaveForm";
import {
  entriesForService,
  OPENING_HOURS_SERVICE_CONFIG,
  readOpeningHoursSetting,
  type OpeningHoursService,
} from "@/lib/openingHoursSettings";
import { requirePermission } from "@/lib/session";

export const OPENING_HOURS_SERVICES: OpeningHoursService[] = ["theokot", "cursusdienst", "elixir"];

/** Welke diensten deze sessie mag bewerken: die van haar eigen post, of alles voor een superadmin. */
export function visibleOpeningHoursServices(session: Parameters<typeof isMemberOfGroup>[0] & { user: { isSuperAdmin: boolean } }) {
  return OPENING_HOURS_SERVICES.filter(
    (service) => session.user.isSuperAdmin || isMemberOfGroup(session, OPENING_HOURS_SERVICE_CONFIG[service].groupCode),
  );
}

export function openingHoursLabel(service: OpeningHoursService): string {
  return service === "elixir" ? "'t ElixIr" : service === "theokot" ? "Theokot" : "Cursusdienst";
}

/**
 * Het tabblad van één dienst op /admin/openingsuren/<dienst>. Elke post ziet
 * enkel de tabbladen van haar eigen dienst (zie de layout).
 */
export async function OpeningHoursAdminView({ locale, service }: { locale: Locale; service: OpeningHoursService }) {
  const nl = locale === "nl";
  const session = await requirePermission("openingHours.manageOwn");
  const visible = visibleOpeningHoursServices(session).filter((value) => value === service);
  if (visible.length === 0) notFound();
  const rows = await prisma.setting.findMany({
    where: { key: { in: visible.map((service) => OPENING_HOURS_SERVICE_CONFIG[service].settingKey) } },
  });
  const settings = new Map(rows.map((row) => [row.key, row.value]));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-[#5c667f]">
          {nl
            ? "Elke post ziet en bewerkt hier alleen haar eigen kaart op de website."
            : "Each post only sees and edits its own card on the website here."}
        </p>
      </div>

      {visible.map((service) => {
        const config = OPENING_HOURS_SERVICE_CONFIG[service];
        const setting = readOpeningHoursSetting(settings.get(config.settingKey), service);
        const entries = entriesForService(setting, service, locale);
        const label = openingHoursLabel(service);
        return (
          <Card className="p-5" key={service}>
            <h2 className="mb-1 text-lg font-semibold">{label}</h2>
            {service === "cursusdienst" ? (
              <p className="mb-4 text-sm text-[#5c667f]">
                {nl ? "De concrete uren beheer je in " : "Manage the concrete hours in "}
                <a className="underline" href="https://cudi.vtk.be/vtk/admin/slots" target="_blank" rel="noreferrer">
                  cudi.vtk.be
                </a>
                {nl
                  ? "; ze komen automatisch samen met de shiften en tijdsloten naar de website."
                  : "; they automatically reach the website together with shifts and time slots."}
              </p>
            ) : null}
            <SaveForm
              action={saveOpeningHoursAction}
              className="space-y-4"
              submitLabel={nl ? "Opslaan" : "Save"}
              savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
              savedMessage={nl ? "Openingsuren opgeslagen" : "Opening hours saved"}
              fallbackErrorMessage={nl ? "Opslaan mislukt." : "Saving failed."}
            >
              <input type="hidden" name="service" value={service} />
              <BilingualGroup locale={locale} layout="side-by-side" className="space-y-3">
                <BilingualInput
                  label={nl ? "Titel" : "Title"}
                  nameNl="titleNl"
                  nameEn="titleEn"
                  defaultValueNl={setting.titleNl}
                  defaultValueEn={setting.titleEn}
                  gridClassName="grid gap-3 md:grid-cols-2"
                />
                <BilingualInput
                  label={nl ? "Ondertitel" : "Subtitle"}
                  nameNl="subtitleNl"
                  nameEn="subtitleEn"
                  defaultValueNl={setting.subtitleNl}
                  defaultValueEn={setting.subtitleEn}
                  gridClassName="grid gap-3 md:grid-cols-2"
                />
                <BilingualTextarea
                  label={nl ? "Extra uitleg (optioneel)" : "Extra note (optional)"}
                  nameNl="noteNl"
                  nameEn="noteEn"
                  defaultValueNl={setting.noteNl}
                  defaultValueEn={setting.noteEn}
                  rows={3}
                  gridClassName="grid gap-3 md:grid-cols-2"
                />
              </BilingualGroup>

              {service !== "cursusdienst" ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {service === "elixir"
                      ? nl ? "Openingsuur (zondag–donderdag)" : "Opening time (Sunday–Thursday)"
                      : nl ? "Uren (maandag–vrijdag)" : "Hours (Monday–Friday)"}
                  </p>
                  {entries.map((entry, index) => (
                    <div className="grid grid-cols-[minmax(110px,1fr)_minmax(150px,2fr)] items-center gap-3" key={entry.dayNl}>
                      <Label htmlFor={`${service}-hours-${index}`}>{nl ? entry.dayNl : entry.dayEn}</Label>
                      <Input
                        id={`${service}-hours-${index}`}
                        name={`hours-${index}`}
                        defaultValue={entry.hours}
                        placeholder={service === "elixir" ? "22:00" : "10:30 – 18:00"}
                      />
                    </div>
                  ))}
                  <p className="text-xs text-[#5c667f]">
                    {nl ? "Laat een dag leeg of vul ‘Gesloten’ in om hem als gesloten te tonen." : "Leave a day blank or enter ‘Closed’ to show it as closed."}
                  </p>
                </div>
              ) : null}
            </SaveForm>
          </Card>
        );
      })}
    </div>
  );
}
