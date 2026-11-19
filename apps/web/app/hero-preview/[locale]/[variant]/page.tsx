import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { getCursusdienstHours } from "@/lib/cursusdienstHours";
import { isHeroPhotoDesign, type HeroDesignName } from "@/lib/home/heroDesign";
import { requirePermission, requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { ToastProvider } from "@/components/ui/toast";
import { LegacyHero, LegacyHeroStyles } from "@/components/editorial/LegacyHero";

// Buiten `app/[locale]/`, zodat de sitekop en de voettekst niet in het kader staan;
// enkel de root layout loopt hierrond. De ontwerptokens komen dus van hier.
import "@/app/design/vtk-base.css";
import "@/app/design/vtk-home.css";

/**
 * Een hero met foto op zichzelf, voor het voorbeeldkader in /admin/home. De echte
 * component met de echte gegevens, zodat het voorbeeld niet kan afwijken van de
 * homepage.
 */
export const metadata = { robots: { index: false, follow: false } };

export default async function HeroPreview({
  params,
}: {
  params: Promise<{ locale: string; variant: string }>;
}) {
  const { locale: localeParam, variant } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === "nl" ? "" : "/en";
  // Doorsturen naar het aanmelden, zoals de admin zelf: een sessie die verloopt
  // terwijl het scherm openstaat, maakt van het kader anders een kale 404.
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/home`);
  await requirePermission("home.edit");

  const design = variant as HeroDesignName;
  if (!isHeroPhotoDesign(design)) notFound();

  const cursusEntries = await getCursusdienstHours(locale);

  return (
    <div className="vtk-design">
      {/* De cookiekeuze komt uit de root layout; in dit kader hoort ze niet, en
          haar stylesheet is hier ook niet geladen. De hoogte van de sitekop staat
          in vtk-site-header.css, dat hier evenmin laadt; de hero rekent ermee. */}
      <style>
        {":root { --vtk-header-height: 73px; } .vtk-cookie-consent-positioner, .vtk-cookie-consent { display: none; }"}
      </style>
      <LegacyHeroStyles />
      {/* Deze route valt buiten `[locale]`, en de ster in het weekoverzicht meldt
          via een toast wanneer de server weigert. */}
      <ToastProvider>
        <LegacyHero
          locale={locale}
          design={design}
          now={new Date()}
          session={session}
          cursusEntries={cursusEntries}
        />
      </ToastProvider>
    </div>
  );
}
