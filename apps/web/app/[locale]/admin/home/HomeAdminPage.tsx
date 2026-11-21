import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";
import { Card, Input, Label } from "@vtk/ui";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import {
  BilingualGroup,
  BilingualInput,
  BilingualTextarea,
} from "@/components/admin/BilingualField";
import { StorageImageField } from "@/components/admin/StorageImageField";
import {
  AANBOD_DEFAULT_BODY_EN,
  AANBOD_DEFAULT_BODY_NL,
  AANBOD_PHOTOS,
} from "@/lib/aanbodCards";
import { SaveForm } from "@/components/ui/SaveForm";
import { POC_BAND_SETTING, readPocBandSetting } from "@/lib/home/pocBand";
import { SHIFTS_BAND_SETTING, readShiftsBandSetting } from "@/lib/home/shiftBand";
import { HERO_DESIGN_SETTING, readHeroDesignSetting } from "@/lib/home/heroDesign";
import { HOURS_LAYOUT_SETTING, readHoursLayoutSetting } from "@/lib/home/hoursLayout";
import { HeroDesignForm } from "./HeroDesignForm";
import {
  saveHomepageCardAction,
  saveCareerAction,
  saveAftermoviesAction,
  saveHomePocBandAction,
  saveHomeShiftsBandAction,
  saveHomeHoursLayoutAction,
} from "@/app/actions/home";

type Career = { titleNl: string; titleEn: string; bodyNl: string; bodyEn: string; ctaLabelNl?: string; ctaLabelEn?: string; ctaUrl?: string };
type Aftermovies = {
  titleNl: string;
  titleEn: string;
  items: Array<{
    id?: string;
    type: "video" | "image";
    url: string;
    titleNl?: string;
    titleEn?: string;
    posterUrl?: string;
    publishedAt?: string;
  }>;
};

function readAftermoviesSetting(value: unknown): Aftermovies | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.items)) return null;

  const items = record.items.flatMap((item): Aftermovies["items"] => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    if (typeof entry.url !== "string") return [];
    return [{
      id: typeof entry.id === "string" ? entry.id : undefined,
      type: entry.type === "image" ? "image" : "video",
      url: entry.url,
      titleNl: typeof entry.titleNl === "string" ? entry.titleNl : undefined,
      titleEn: typeof entry.titleEn === "string" ? entry.titleEn : undefined,
      posterUrl: typeof entry.posterUrl === "string" ? entry.posterUrl : undefined,
      publishedAt: typeof entry.publishedAt === "string" ? entry.publishedAt : undefined,
    }];
  });

  return {
    titleNl: typeof record.titleNl === "string" ? record.titleNl : "Aftermovies",
    titleEn: typeof record.titleEn === "string" ? record.titleEn : "Aftermovies",
    items,
  };
}

/** De tabbladen van /admin/home; elk is een eigen route (zie de layout). */
export type HomeSection = "hero" | "openingsuren" | "aanbod" | "banden" | "career";

/**
 * Het beheer van de homepage, per tabblad enkel de blokken van dat tabblad.
 * Alles over de hero staat in het tabblad Hero, en nergens anders (zie
 * CLAUDE.md, "Hero").
 */
export async function HomeAdminPage({ locale, section }: { locale: Locale; section: HomeSection }) {
  await requirePermission("home.edit");
  const dict = getDictionary(locale);

  const base = locale === "nl" ? "" : "/en";
  const [rows, homepageCards] = await Promise.all([
    prisma.setting.findMany({
      where: {
        key: {
          in: [
            "home.career",
            "media.aftermovies",
            "home.aftermovies",
            POC_BAND_SETTING,
            SHIFTS_BAND_SETTING,
            HERO_DESIGN_SETTING,
            HOURS_LAYOUT_SETTING,
          ],
        },
      },
    }),
    prisma.headerTab.findMany({
      where: { visible: true },
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        labelNl: true,
        labelEn: true,
        imageKey: true,
        homeBodyNl: true,
        homeBodyEn: true,
      },
    }),
  ]);
  const map = new Map(rows.map((row: { key: string; value: unknown }) => [row.key, row.value]));
  const career = (map.get("home.career") as Career | undefined) ?? { titleNl: "", titleEn: "", bodyNl: "", bodyEn: "" };
  const after = readAftermoviesSetting(map.get("media.aftermovies"))
    ?? readAftermoviesSetting(map.get("home.aftermovies"))
    ?? { titleNl: "", titleEn: "", items: [] };
  const pocSetting = readPocBandSetting(map.get(POC_BAND_SETTING));
  const shiftsBand = readShiftsBandSetting(map.get(SHIFTS_BAND_SETTING));
  const hoursLayout = readHoursLayoutSetting(map.get(HOURS_LAYOUT_SETTING));

  return (
    <div className="space-y-6">

      {section === "hero" && (
      <HeroDesignForm
        locale={locale}
        initial={readHeroDesignSetting(map.get(HERO_DESIGN_SETTING))}
        labels={{
          save: dict.admin.save,
          saving: dict.common.saving,
          saved: dict.common.saved,
          saveError: dict.common.saveError,
        }}
      />
      )}

      {section === "openingsuren" && (
      <Card className="p-5" style={{ boxShadow: "inset 3px 0 0 var(--yellow)" }}>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold">
              {locale === "nl" ? "De uren zelf stel je hier niet in" : "The hours themselves are not set here"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[#5c667f]">
              {locale === "nl"
                ? "Wanneer Theokot, de Fakbar en de andere diensten open zijn, pas je aan onder Website › Openingsuren. Op dit tabblad kies je enkel hoe de band op de homepage eruitziet."
                : "When Theokot, the Fakbar and the other services are open is edited under Website › Opening hours. This tab only sets how the band on the homepage looks."}
            </p>
          </div>
          <Link
            href={`${base}/admin/openingsuren`}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-vtk-ink px-4 py-2 text-sm font-medium text-white hover:bg-vtk-navy"
          >
            {locale === "nl" ? "Naar Openingsuren" : "Go to Opening hours"}
          </Link>
        </div>
      </Card>
      )}

      {section === "openingsuren" && (
      <Card className="p-5">
        <div className="mb-3">
          <h2 className="font-semibold">{locale === "nl" ? "Weergave op de homepage" : "Layout on the homepage"}</h2>
          <p className="text-sm text-[#5c667f]">
            {locale === "nl"
              ? "Beide tonen vandaag op een tijdas en de uren van de week."
              : "Both show today on a time axis and the hours of the week."}
          </p>
        </div>
        <SaveForm
          action={saveHomeHoursLayoutAction}
          className="space-y-4"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={dict.common.saved}
          fallbackErrorMessage={dict.common.saveError}
        >
          <div className="max-w-md space-y-1.5">
            <Label htmlFor="hours-layout">{locale === "nl" ? "Weergave" : "Layout"}</Label>
            <ThemedSelect
              id="hours-layout"
              name="layout"
              defaultValue={hoursLayout.layout}
              options={[
                {
                  value: "strips",
                  label:
                    locale === "nl"
                      ? "Week in strepen (standaard): per dienst een kolom met de week als grafiek"
                      : "Week in stripes (default): one column per service with the week as a chart",
                },
                {
                  value: "plain",
                  label:
                    locale === "nl"
                      ? "Zonder kader: per dienst een rij, de week als tekst"
                      : "Without a frame: one row per service, the week as text",
                },
              ]}
            />
          </div>
        </SaveForm>
      </Card>
      )}

      {section === "aanbod" && (
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">{locale === "nl" ? "Wat we doen" : "What we do"}</h2>
        <p className="mb-5 text-sm text-[#5c667f]">
          {locale === "nl"
            ? "Beheer de foto en het tekstje op elke categoriekaart. De eerste zes zichtbare categorieën verschijnen op de homepage; hun volgorde beheer je onder Inhoud."
            : "Manage the photo and the text on each category card. The first six visible categories appear on the homepage; manage their order under Content."}
        </p>

        {homepageCards.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {homepageCards.map((tab) => (
              <SaveForm
                key={tab.id}
                action={saveHomepageCardAction}
                className="space-y-4 rounded-xl border border-vtk-blue/10 p-4"
                submitLabel={dict.admin.save}
                savingLabel={dict.common.saving}
                savedMessage={dict.common.saved}
                fallbackErrorMessage={dict.common.saveError}
              >
                <input type="hidden" name="id" value={tab.id} />
                <div>
                  <h3 className="font-medium">
                    {locale === "nl" ? tab.labelNl : tab.labelEn}
                  </h3>
                  <p className="font-mono text-xs text-[#5c667f]">/{tab.slug}</p>
                </div>
                <StorageImageField
                  defaultKey={tab.imageKey}
                  locale={locale}
                  label={locale === "nl" ? "Kaartfoto" : "Card photo"}
                  fallbackUrl={AANBOD_PHOTOS[tab.slug]}
                  srContext={locale === "nl" ? tab.labelNl : tab.labelEn}
                  helpText={
                    AANBOD_PHOTOS[tab.slug]
                      ? locale === "nl"
                        ? "Zonder upload gebruikt deze kaart de standaardfoto uit de preview."
                        : "Without an upload, this card uses the default photo shown here."
                      : locale === "nl"
                        ? "Deze kaart heeft geen standaardfoto: zonder upload toont ze het gestreepte patroon."
                        : "This card has no default photo: without an upload it shows the striped pattern."
                  }
                />
                <BilingualGroup
                  locale={locale}
                  layout="side-by-side"
                  enHint={
                    locale === "nl"
                      ? "Laat leeg om de standaardzin te tonen; vul je enkel Nederlands in, dan staat die zin ook op de Engelse site."
                      : "Leave empty to show the default sentence; with only Dutch filled in, that text also appears on the English site."
                  }
                >
                  <BilingualTextarea
                    label={locale === "nl" ? "Tekst" : "Text"}
                    nameNl="homeBodyNl"
                    nameEn="homeBodyEn"
                    defaultValueNl={tab.homeBodyNl ?? ""}
                    defaultValueEn={tab.homeBodyEn ?? ""}
                    placeholderNl={AANBOD_DEFAULT_BODY_NL}
                    placeholderEn={tab.homeBodyNl?.trim() || AANBOD_DEFAULT_BODY_EN}
                    rows={2}
                    idPrefix={`homeBody-${tab.id}`}
                  />
                </BilingualGroup>
              </SaveForm>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#5c667f]">
            {locale === "nl"
              ? "Er zijn nog geen zichtbare categorieën. Maak ze eerst aan onder Inhoud."
              : "There are no visible categories yet. Create them under Content first."}
          </p>
        )}
      </Card>
      )}

      {section === "banden" && (
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="font-semibold">{locale === "nl" ? "POC-band" : "POC band"}</h2>
            <p className="text-sm text-[#5c667f]">
              {locale === "nl"
                ? "Toont de vertegenwoordigers van de student op basis van studierichting, of de verkiezingsoproep. Schakel de band hier uit of kies de weergave."
                : "Shows the student's representatives based on their programme, or the election call. Disable the band here or choose its display mode."}
            </p>
          </div>
          <Link
            href={`${base}/admin/pocs`}
            className="text-xs text-vtk-blue hover:underline whitespace-nowrap self-start sm:self-auto shrink-0"
          >
            {locale === "nl" ? "Teksten & tijdlijn beheren" : "Manage texts & timeline"} →
          </Link>
        </div>

        <SaveForm
          action={saveHomePocBandAction}
          className="space-y-4"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={dict.common.saved}
          fallbackErrorMessage={dict.common.saveError}
        >
          <div className="space-y-1.5 max-w-md">
            <Label htmlFor="poc-band-mode">
              {locale === "nl" ? "Weergave op de homepage" : "Homepage display"}
            </Label>
            <ThemedSelect
              id="poc-band-mode"
              name="mode"
              defaultValue={pocSetting.mode}
              options={[
                {
                  value: "representatives",
                  label:
                    locale === "nl"
                      ? "Vertegenwoordigers tonen (foto's & namen van jouw richtingen)"
                      : "Show representatives (photos & names of your programmes)",
                },
                {
                  value: "elections",
                  label:
                    locale === "nl"
                      ? "Verkiezingen tonen (paneel met oproep, deadline & procedure)"
                      : "Show elections (panel with call, deadline & procedure)",
                },
              ]}
            />
            <p className="text-xs text-[#5c667f]">
              {locale === "nl"
                ? "Kies 'Band uitschakelen' om de POC-band volledig te verbergen van de homepage."
                : "Choose 'Disable band' to hide the POC band completely from the homepage."}
            </p>
          </div>
        </SaveForm>
      </Card>
      )}

      {section === "openingsuren" && (
      <Card className="p-5">
        <h2 className="font-semibold mb-1">
          {locale === "nl" ? "Openingsuren" : "Opening hours"} – Cursusdienst
        </h2>
        <p className="text-sm text-[#5c667f]">
          {locale === "nl" ? (
            <>
              De cursusdienst-openingsuren komen live van{" "}
              <a href="https://cudi.vtk.be/vtk/admin/slots" className="underline" target="_blank" rel="noreferrer">
                cudi.vtk.be
              </a>
              , waar ze meteen ook shiften en tijdsloten genereren. Ze verschijnen
              automatisch op de startpagina; de toelichting beheer je in de centrale Openingsuren-tab.
            </>
          ) : (
            <>
              The course shop opening hours come live from{" "}
              <a href="https://cudi.vtk.be/vtk/admin/slots" className="underline" target="_blank" rel="noreferrer">
                cudi.vtk.be
              </a>
              , where they also generate shifts and time slots. They appear on the
              homepage automatically; edit the note in the central Opening hours tab.
            </>
          )}
        </p>
      </Card>
      )}

      {section === "career" && (
      <Card className="p-5">
        <h2 className="font-semibold mb-3">VTK Career</h2>
        <SaveForm
          action={saveCareerAction}
          className="space-y-2"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={dict.common.saved}
          fallbackErrorMessage={dict.common.saveError}
        >
          <BilingualGroup locale={locale} layout="side-by-side" className="space-y-2">
            <BilingualInput
              label="Title"
              nameNl="titleNl"
              nameEn="titleEn"
              defaultValueNl={career.titleNl}
              defaultValueEn={career.titleEn}
              gridClassName="grid grid-cols-1 gap-2 md:grid-cols-2"
            />
            <BilingualTextarea
              label="Body"
              nameNl="bodyNl"
              nameEn="bodyEn"
              defaultValueNl={career.bodyNl}
              defaultValueEn={career.bodyEn}
              rows={3}
              gridClassName="grid grid-cols-1 gap-2 md:grid-cols-2"
            />
            <BilingualInput
              label="CTA label"
              nameNl="ctaLabelNl"
              nameEn="ctaLabelEn"
              defaultValueNl={career.ctaLabelNl ?? ""}
              defaultValueEn={career.ctaLabelEn ?? ""}
              gridClassName="grid grid-cols-1 gap-2 md:grid-cols-2"
            />
          </BilingualGroup>
          <div>
            <Label>CTA URL</Label>
            <Input name="ctaUrl" defaultValue={career.ctaUrl ?? ""} />
          </div>
        </SaveForm>
      </Card>
      )}

      {section === "career" && (
      <Card className="p-5">
        <h2 className="font-semibold mb-3">
          {locale === "nl" ? "Aftermovies & sfeerbeelden" : "Aftermovies & photos"}
        </h2>
        <SaveForm
          action={saveAftermoviesAction}
          className="space-y-2"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={dict.common.saved}
          fallbackErrorMessage={dict.common.saveError}
        >
          <BilingualGroup locale={locale} layout="side-by-side" className="space-y-2">
            <BilingualInput
              label="Title"
              nameNl="titleNl"
              nameEn="titleEn"
              defaultValueNl={after.titleNl}
              defaultValueEn={after.titleEn}
              gridClassName="grid grid-cols-1 gap-2 md:grid-cols-2"
            />
          </BilingualGroup>
          <table className="w-full text-sm">
            <thead className="text-left"><tr><th>Type</th><th>URL (YouTube embed / image URL)</th><th>Title (NL)</th><th>Title (EN)</th></tr></thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => {
                const item: Aftermovies["items"][number] = after.items[i]
                  ?? { type: "video", url: "", titleNl: "", titleEn: "" };
                return (
                  <tr key={i}>
                    <td className="pr-2 py-1">
                      <input type="hidden" name={`id-${i}`} value={item.id ?? ""} />
                      <input type="hidden" name={`posterUrl-${i}`} value={item.posterUrl ?? ""} />
                      <input type="hidden" name={`publishedAt-${i}`} value={item.publishedAt ?? ""} />
                      <ThemedSelect
                        name={`type-${i}`}
                        defaultValue={item.type}
                        ariaLabel={locale === "nl" ? "Soort" : "Type"}
                        options={[
                          { value: "video", label: "video" },
                          { value: "image", label: "image" },
                        ]}
                      />
                    </td>
                    <td className="pr-2 py-1"><Input name={`url-${i}`} defaultValue={item.url} /></td>
                    <td className="pr-2 py-1"><Input name={`titleNl-${i}`} defaultValue={item.titleNl ?? ""} /></td>
                    <td className="py-1"><Input name={`titleEn-${i}`} defaultValue={item.titleEn ?? ""} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SaveForm>
      </Card>
      )}

      {section === "banden" && (
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="font-semibold">{locale === "nl" ? "Shiften-band" : "Shifts band"}</h2>
            <p className="text-sm text-[#5c667f]">
              {locale === "nl"
                ? "Toont maximaal 4 openstaande shiften voor de komende 7 dagen op de homepage, inclusief directe inschrijfknop en detailvenster."
                : "Shows up to 4 open shifts for the next 7 days on the homepage, including direct registration and details dialog."}
            </p>
          </div>
          <Link
            href={`${base}/shift`}
            className="text-xs text-vtk-blue hover:underline whitespace-nowrap self-start sm:self-auto shrink-0"
          >
            {locale === "nl" ? "Naar shiftpagina" : "Go to shifts page"} →
          </Link>
        </div>

        <SaveForm
          action={saveHomeShiftsBandAction}
          className="space-y-4"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={dict.common.saved}
          fallbackErrorMessage={dict.common.saveError}
        >
          <div className="space-y-1.5 max-w-md">
            <Label htmlFor="shifts-band-visible">
              {locale === "nl" ? "Zichtbaarheid op de homepage" : "Homepage visibility"}
            </Label>
            <ThemedSelect
              id="shifts-band-visible"
              name="visible"
              defaultValue={shiftsBand.visible ? "true" : "false"}
              options={[
                {
                  value: "true",
                  label:
                    locale === "nl"
                      ? "Zichtbaar (shiften tonen op homepage)"
                      : "Visible (show shifts on homepage)",
                },
                {
                  value: "false",
                  label:
                    locale === "nl"
                      ? "Band uitschakelen (verborgen op de homepage)"
                      : "Disable band (hidden on homepage)",
                },
              ]}
            />
            <p className="text-xs text-[#5c667f]">
              {locale === "nl"
                ? "Kies 'Band uitschakelen' om de shiften-band volledig te verbergen van de homepage."
                : "Choose 'Disable band' to hide the shifts band completely from the homepage."}
            </p>
          </div>
        </SaveForm>
      </Card>
      )}

    </div>
  );
}
