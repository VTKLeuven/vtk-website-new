"use client";

import { Card, Input, Label } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { saveHeaderTabLinkAction } from "@/app/actions/pages";
import { StorageImageField } from "@/components/admin/StorageImageField";
import { SaveForm } from "@/components/ui/SaveForm";
import { isExternalUrl } from "@/lib/href";
import { contentErrorMessages } from "./messages";
import { InspectorHead } from "./TabInspector";
import type { TabLinkNode } from "./ContentManager";

/** Instellingen en categoriekaartfoto van een vaste route of externe link. */
export function LinkInspector({
  locale,
  link,
  onClose,
}: {
  locale: Locale;
  link: TabLinkNode;
  onClose: () => void;
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);
  const external = isExternalUrl(link.url);

  return (
    <Card className="p-5">
      <InspectorHead
        title={nl ? link.labelNl : link.labelEn}
        subtitle={link.url}
        onClose={onClose}
      />

      <SaveForm
        action={saveHeaderTabLinkAction}
        className="space-y-5"
        submitLabel={dict.admin.save}
        savingLabel={dict.common.saving}
        savedMessage={dict.common.saved}
        errorMessages={contentErrorMessages(locale)}
        fallbackErrorMessage={dict.common.saveError}
      >
        <input type="hidden" name="id" value={link.id} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`link-${link.id}-labelNl`}>{nl ? "Label (NL)" : "Label (NL)"}</Label>
            <Input
              id={`link-${link.id}-labelNl`}
              name="labelNl"
              defaultValue={link.labelNl}
              required
            />
          </div>
          <div>
            <Label htmlFor={`link-${link.id}-labelEn`}>{nl ? "Label (EN)" : "Label (EN)"}</Label>
            <Input
              id={`link-${link.id}-labelEn`}
              name="labelEn"
              defaultValue={link.labelEn}
              required
            />
          </div>
        </div>

        <div>
          <Label htmlFor={`link-${link.id}-url`}>
            {external
              ? nl
                ? "Externe link"
                : "External URL"
              : nl
                ? "Vaste route"
                : "Built-in route"}
          </Label>
          <Input id={`link-${link.id}-url`} name="url" defaultValue={link.url} required />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl
              ? "Een pad op deze site (/praesidium) of een volledig adres (https://...)."
              : "A path on this site (/praesidium) or a full URL (https://...)."}
          </p>
        </div>

        <div className="border-t border-vtk-blue/10 pt-5">
          <StorageImageField
            defaultKey={link.imageKey}
            locale={locale}
            label={nl ? "Foto op de categoriepagina" : "Photo on the category page"}
            helpText={
              nl
                ? "Deze foto verschijnt op de kaart van dit item. Zonder foto toont de kaart een gestreept patroon."
                : "This photo appears on this item's card. Without one, the card shows a striped pattern."
            }
            srContext={nl ? link.labelNl : link.labelEn}
          />
        </div>
      </SaveForm>
    </Card>
  );
}
