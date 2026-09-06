"use client";

import { Card } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { StorageImageField } from "@/components/admin/StorageImageField";
import { SaveForm } from "@/components/ui/SaveForm";
import { savePageImageAction } from "@/app/actions/pages";
import { saveErrorMessages } from "@/lib/saveMessages";

/**
 * De foto van deze pagina, vanuit de pagina-editor (hetzelfde veld als in
 * Website → Header). Ze doet twee dingen: ze staat op de kaart van deze pagina
 * op de categoriepagina, en ze draagt de donkere kop bovenaan de pagina zelf.
 */
export function PageCategoryImageCard({
  locale,
  pageId,
  pageTitle,
  imageKey,
}: {
  locale: Locale;
  pageId: string;
  pageTitle: string;
  imageKey: string | null;
}) {
  const nl = locale === "nl";

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-vtk-ink">
        {nl ? "Foto van de pagina" : "Page photo"}
      </h2>
      <p className="mt-1 text-xs text-[#5c667f]">
        {nl
          ? "Deze foto draagt de donkere kop bovenaan de pagina, en staat op de kaart van deze pagina op de categoriepagina. Zonder foto blijft de kop het technische patroon tonen."
          : "This photo carries the dark header at the top of the page, and appears on this page's card on the category page. Without a photo the header keeps the technical pattern."}
      </p>

      <SaveForm
        action={savePageImageAction}
        className="mt-4 space-y-4"
        submitLabel={nl ? "Foto opslaan" : "Save photo"}
        savingLabel={nl ? "Foto opslaan…" : "Saving photo…"}
        savedMessage={nl ? "Foto opgeslagen" : "Photo saved"}
        errorMessages={saveErrorMessages(locale)}
        fallbackErrorMessage={nl ? "De foto kon niet worden opgeslagen." : "The photo could not be saved."}
        resetOnSuccess={false}
      >
        <input type="hidden" name="id" value={pageId} />
        <StorageImageField
          defaultKey={imageKey}
          locale={locale}
          label={nl ? "Foto" : "Photo"}
          fallbackUrl="/technisch-pattern-light.png"
          fallbackPosition="left"
          emptyHint={nl ? "Technisch patroon" : "Technical pattern"}
          helpText={
            nl
              ? "Zonder foto gebruikt de kaart het technische patroon uit de huisstijl."
              : "Without a photo, the card uses the technical brand pattern."
          }
          srContext={pageTitle}
        />
      </SaveForm>
    </Card>
  );
}
