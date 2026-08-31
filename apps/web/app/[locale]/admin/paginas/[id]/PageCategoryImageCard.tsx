"use client";

import { Card } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { StorageImageField } from "@/components/admin/StorageImageField";
import { SaveForm } from "@/components/ui/SaveForm";
import { savePageImageAction } from "@/app/actions/pages";
import { saveErrorMessages } from "@/lib/saveMessages";

/** Dezelfde categoriekaartfoto als in Website → Header, vanuit de pagina-editor. */
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
        {nl ? "Foto op de categoriepagina" : "Photo on the category page"}
      </h2>
      <p className="mt-1 text-xs text-[#5c667f]">
        {nl
          ? "Deze foto verschijnt op de kaart van deze pagina zodra ze aan een categorie gekoppeld is."
          : "This photo appears on this page's card once the page is linked to a category."}
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
