import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getAppLinks } from "@/lib/appLinks";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveAppLinksAction } from "../actions";

/**
 * De links naar de app in de winkels. `vtk.be/app` leest ze; de QR-code op de
 * affiches wijst naar dat adres en blijft dus dezelfde, wat er hier ook
 * verandert.
 */
export default async function AdminAppLinks({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("home.edit");
  const nl = locale === "nl";
  const t = (dutch: string, english: string) => (nl ? dutch : english);
  const links = await getAppLinks();

  return (
    <section className="max-w-2xl space-y-3" aria-labelledby="app-links">
      <div>
        <h2 id="app-links" className="text-lg font-semibold">
          {t("Links naar de winkels", "Store links")}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {t(
            "Waar de VTK-app te downloaden is. vtk.be/app stuurt een iPhone naar de App Store en een Android-toestel naar Google Play; een computer krijgt een pagina met beide knoppen. Zet dat adres in een QR-code op een affiche: het blijft geldig, ook als de links hier veranderen.",
            "Where to download the VTK app. vtk.be/app sends an iPhone to the App Store and an Android device to Google Play; a computer gets a page with both buttons. Put that address in a QR code on a poster: it stays valid, even when the links here change.",
          )}
        </p>
      </div>

      <SaveForm
        action={saveAppLinksAction}
        submitLabel={t("Opslaan", "Save")}
        savingLabel={t("Bezig met opslaan", "Saving")}
        savedMessage={t("De links zijn opgeslagen.", "The links are saved.")}
        errorMessages={{
          INVALID_LINK: t(
            "Een link moet een volledig adres zijn dat met https:// begint.",
            "A link has to be a full address starting with https://.",
          ),
        }}
        fallbackErrorMessage={t("Opslaan lukte niet.", "Saving failed.")}
        resetOnSuccess={false}
        className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5"
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">App Store (iPhone)</span>
          <input
            name="ios"
            type="url"
            inputMode="url"
            defaultValue={links.ios ?? ""}
            placeholder="https://apps.apple.com/be/app/vtk-leuven/id..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Google Play (Android)</span>
          <input
            name="android"
            type="url"
            inputMode="url"
            defaultValue={links.android ?? ""}
            placeholder="https://play.google.com/store/apps/details?id=..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-sm text-zinc-500">
          {t("Leeg laten mag: dan toont vtk.be/app enkel de andere winkel.", "You can leave one empty: vtk.be/app then only shows the other store.")}
        </p>
      </SaveForm>

      <p className="text-sm">
        <a href={`/${locale === "en" ? "en/" : ""}app?toon=1`} className="underline">
          {t("Bekijk vtk.be/app zoals een computer hem ziet", "Preview vtk.be/app as a computer sees it")}
        </a>
      </p>
    </section>
  );
}
