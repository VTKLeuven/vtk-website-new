import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import { getDictionary, type Locale } from "@vtk/i18n";
import { Card } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { SaveForm } from "@/components/ui/SaveForm";
import { StorageImageField } from "@/components/admin/StorageImageField";
import { BUILTIN_DEFAULT_EVENT_IMAGE, DEFAULT_EVENT_IMAGE_SETTING } from "@/lib/defaultEventImage";
import { saveDefaultEventImageAction } from "@/app/actions/home";

/**
 * De banner van een evenement zonder eigen foto en zonder foto op zijn
 * categorie. Stond onder Homepagina › Evenementen, maar het is een instelling
 * van de kalender: ze geldt op elke eventpagina, niet enkel op de homepage, en
 * hoort naast de banners per categorie.
 */
export default async function AdminCalendarDefaultBanner({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const dict = getDictionary(locale);

  // Net als de categorieën: dit geldt over alle posten heen.
  const session = await requireSession();
  if (!session.user.isSuperAdmin && !hasPermission(session, "calendar.manageAll")) notFound();

  const row = await prisma.setting.findUnique({ where: { key: DEFAULT_EVENT_IMAGE_SETTING } });
  const imageKey = (row?.value as { imageKey?: string | null } | undefined)?.imageKey ?? null;

  return (
    <Card className="p-5">
      <h2 className="mb-1 font-semibold">{nl ? "Standaardbanner" : "Default banner"}</h2>
      <p className="mb-4 max-w-3xl text-sm text-[#5c667f]">
        {nl
          ? "Deze foto verschijnt op de homepage en op de eventpagina van een evenement zonder eigen banner, wanneer ook zijn categorie geen banner heeft."
          : "This photo appears on the homepage and on the event page of an event without its own banner, when its category has no banner either."}
      </p>
      <SaveForm
        action={saveDefaultEventImageAction}
        submitLabel={dict.admin.save}
        savingLabel={dict.common.saving}
        savedMessage={dict.common.saved}
        fallbackErrorMessage={dict.common.saveError}
      >
        <StorageImageField
          defaultKey={imageKey}
          locale={locale}
          label={nl ? "Standaardbanner" : "Default banner"}
          fallbackUrl={BUILTIN_DEFAULT_EVENT_IMAGE}
          srContext={nl ? "Standaardbanner evenementen" : "Default event banner"}
          helpText={
            nl
              ? "Zonder upload gebruiken evenementen de meegeleverde foto uit de preview."
              : "Without an upload, events use the bundled photo shown here."
          }
        />
      </SaveForm>
    </Card>
  );
}
