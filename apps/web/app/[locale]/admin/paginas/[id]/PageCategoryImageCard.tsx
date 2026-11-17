"use client";

import { useState } from "react";
import { Card, Input, Label } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { StorageImageField } from "@/components/admin/StorageImageField";
import { ImageFocusField } from "@/components/admin/ImageFocusField";
import { SaveForm } from "@/components/ui/SaveForm";
import { savePageImageAction } from "@/app/actions/pages";
import { saveErrorMessages } from "@/lib/saveMessages";
import { storageKeyPath } from "@/lib/storageKeyPath";
import { CENTER_FOCUS, focusPosition, type ImageFocus } from "@/lib/imageFocus";

/**
 * De foto van deze pagina, vanuit de pagina-editor (hetzelfde veld als in
 * Website → Header). Ze verschijnt twee keer: als brede plaat boven de tekst van
 * de pagina zelf, en op de kaart van deze pagina op de categoriepagina.
 *
 * Naast de upload staan twee dingen die de plaat vraagt en de oude fotokop niet:
 * een bijschrift, want een foto zonder woorden boven een artikel is decoratie,
 * en een uitsnedepunt, want de plaat is 2,45:1 en de kaart bijna vierkant.
 */
export function PageCategoryImageCard({
  locale,
  pageId,
  pageTitle,
  imageKey,
  captionNl,
  captionEn,
  focus,
}: {
  locale: Locale;
  pageId: string;
  pageTitle: string;
  imageKey: string | null;
  captionNl: string | null;
  captionEn: string | null;
  focus: ImageFocus | null;
}) {
  const nl = locale === "nl";
  // De uitsnede hangt aan de key in deze state en niet aan de opgeslagen waarde,
  // zodat ze meteen de zopas gekozen foto toont in plaats van de vorige.
  const [key, setKey] = useState(imageKey ?? "");
  const [point, setPoint] = useState<ImageFocus>(focus ?? CENTER_FOCUS);

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-vtk-ink">
        {nl ? "Foto van de pagina" : "Page photo"}
      </h2>
      <p className="mt-1 text-xs text-[#5c667f]">
        {nl
          ? "Deze foto staat als brede plaat boven de tekst van deze pagina, en op de kaart van deze pagina op de categoriepagina. Zonder foto beginnen allebei met het technische patroon."
          : "This photo sits as a wide plate above the text of this page, and on this page's card on the category page. Without a photo both start with the technical pattern."}
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
              ? "Zonder foto beginnen de pagina en de kaart met het technische patroon uit de huisstijl."
              : "Without a photo, the page and the card start with the technical brand pattern."
          }
          srContext={pageTitle}
          onChange={setKey}
          previewPosition={focusPosition(point)}
        />

        <ImageFocusField
          imageUrl={key ? `/api/media/${storageKeyPath(key)}` : null}
          defaultFocus={focus}
          locale={locale}
          label={nl ? "Deel van de foto dat in beeld blijft" : "Part of the photo that stays in view"}
          helpText={
            nl
              ? "Sleep het bolletje naar wat zeker zichtbaar moet blijven. De plaat is breed en de kaart bijna vierkant, dus één uitsnede past niet vanzelf op allebei."
              : "Drag the dot to whatever has to stay visible. The plate is wide and the card almost square, so one crop does not fit both by itself."
          }
          previews={[
            { label: nl ? "Plaat op de pagina" : "Plate on the page", ratio: "2.45 / 1" },
            { label: nl ? "Telefoon" : "Phone", ratio: "16 / 10" },
            { label: nl ? "Kaart op de categoriepagina" : "Card on the category page", ratio: "1 / 1" },
          ]}
          onChange={setPoint}
        />

        {/* Het bijschrift staat onder de plaat op de pagina zelf. Optioneel: een
            foto die voor zichzelf spreekt heeft er geen nodig, en dan staat er
            gewoon niets. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`caption-nl-${pageId}`}>
              {nl ? "Bijschrift" : "Caption"}
            </Label>
            <Input
              id={`caption-nl-${pageId}`}
              name="captionNl"
              defaultValue={captionNl ?? ""}
              maxLength={200}
              placeholder={nl ? "Wie of wat staat er op?" : "Who or what is in the photo?"}
            />
          </div>
          <div>
            <Label htmlFor={`caption-en-${pageId}`}>
              {nl ? "Engels bijschrift" : "English caption"}
            </Label>
            <Input
              id={`caption-en-${pageId}`}
              name="captionEn"
              defaultValue={captionEn ?? ""}
              maxLength={200}
              placeholder={nl ? "Leeg = het Nederlandse" : "Empty = the Dutch one"}
            />
          </div>
        </div>
        <p className="text-xs text-[#5c667f]">
          {nl
            ? "Optioneel. Het bijschrift staat klein onder de plaat en is meteen ook de alt-tekst van de foto."
            : "Optional. The caption sits below the plate in small type and doubles as the photo's alt text."}
        </p>
      </SaveForm>
    </Card>
  );
}
