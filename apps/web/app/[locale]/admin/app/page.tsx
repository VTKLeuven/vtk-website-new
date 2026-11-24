import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getAppLinks } from "@/lib/appLinks";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveAppLinksAction } from "./actions";

/**
 * Admin › Website › App: de links naar de VTK-app in de App Store en in Google
 * Play. `vtk.be/app` leest ze; de QR-code op de affiches wijst naar dat adres en
 * blijft dus dezelfde, wat er hier ook verandert.
 */
export default async function AdminAppLinks({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("home.edit");
  const nl = locale === "nl";
  const links = await getAppLinks();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">App</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? "Waar de VTK-app te downloaden is. vtk.be/app stuurt een iPhone naar de App Store en een Android-toestel naar Google Play; een computer krijgt een pagina met beide knoppen. Zet dat adres in een QR-code op een affiche: het blijft geldig, ook als de links hier veranderen."
            : "Where to download the VTK app. vtk.be/app sends an iPhone to the App Store and an Android device to Google Play; a computer gets a page with both buttons. Put that address in a QR code on a poster: it stays valid, even when the links here change."}
        </p>
      </div>

      <SaveForm
        action={saveAppLinksAction}
        submitLabel={nl ? "Opslaan" : "Save"}
        savingLabel={nl ? "Bezig met opslaan" : "Saving"}
        savedMessage={nl ? "De links zijn opgeslagen." : "The links are saved."}
        errorMessages={{
          INVALID_LINK: nl
            ? "Een link moet een volledig adres zijn dat met https:// begint."
            : "A link has to be a full address starting with https://.",
        }}
        fallbackErrorMessage={nl ? "Opslaan lukte niet." : "Saving failed."}
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
          {nl ? "Leeg laten mag: dan toont vtk.be/app enkel de andere winkel." : "You can leave one empty: vtk.be/app then only shows the other store."}
        </p>
      </SaveForm>

      <p className="text-sm">
        <a href={`/${locale === "en" ? "en/" : ""}app?toon=1`} className="underline">
          {nl ? "Bekijk vtk.be/app zoals een computer hem ziet" : "Preview vtk.be/app as a computer sees it"}
        </a>
      </p>
    </div>
  );
}
