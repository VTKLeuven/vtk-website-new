"use client";

import { Input, Label, Select } from "@vtk/ui";
import { getDictionary } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveErrorMessages } from "@/lib/saveMessages";
import { saveCalendarCategoryAction } from "@/app/actions/calendar";

export type CategoryRow = {
  id: string;
  slug: string;
  nameNl: string;
  nameEn: string;
  colour: string;
  order: number;
  showOnCalendarPage: boolean;
  audience: "FIRST_YEARS" | "INTERNATIONALS" | null;
  eventCount: number;
};

/**
 * Eén formulier voor zowel nieuw als bestaand: het verschil is enkel de hidden
 * id. Zo staat elke rij in de lijst met dezelfde velden als het toevoegblok,
 * inclusief de slug, die je bewust nog kan aanpassen.
 */
export function CategoryForm({
  category,
  locale,
}: {
  category?: CategoryRow;
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);

  return (
    <SaveForm
      action={saveCalendarCategoryAction}
      className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_1fr_auto_5rem_10rem_auto] [&>button]:justify-self-start"
      submitLabel={category ? (nl ? "Opslaan" : "Save") : nl ? "Toevoegen" : "Add"}
      savingLabel={dict.common.saving}
      savedMessage={
        category
          ? nl
            ? "Categorie opgeslagen"
            : "Category saved"
          : nl
            ? "Categorie toegevoegd"
            : "Category added"
      }
      errorMessages={{
        ...saveErrorMessages(locale),
        SLUG_TAKEN: nl
          ? "Niet opgeslagen: die slug is al in gebruik door een andere categorie."
          : "Not saved: that slug is already used by another category.",
      }}
      fallbackErrorMessage={dict.common.saveError}
    >
      {category && <input type="hidden" name="id" value={category.id} />}
      <div>
        <Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label>
        <Input name="nameNl" defaultValue={category?.nameNl} required maxLength={60} />
      </div>
      <div>
        <Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label>
        <Input name="nameEn" defaultValue={category?.nameEn} required maxLength={60} />
      </div>
      <div>
        <Label>Slug</Label>
        <Input
          name="slug"
          defaultValue={category?.slug}
          required
          maxLength={60}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          placeholder="eerstejaars"
          title={
            nl
              ? "Kleine letters, cijfers en koppeltekens. Staat in de URL en in de agenda-feed."
              : "Lowercase letters, digits and hyphens. Appears in the URL and the calendar feed."
          }
        />
      </div>
      <div>
        <Label>{nl ? "Kleur" : "Colour"}</Label>
        <input
          type="color"
          name="colour"
          defaultValue={category?.colour ?? "#5C667F"}
          className="h-10 w-14 cursor-pointer rounded-lg border border-vtk-blue/15 bg-white p-1"
        />
      </div>
      <div>
        <Label>{nl ? "Volgorde" : "Order"}</Label>
        <Input name="order" type="number" min={0} max={999} defaultValue={category?.order ?? 0} />
      </div>
      <div>
        <Label>{nl ? "Doelgroep" : "Audience"}</Label>
        <Select
          name="audience"
          defaultValue={category?.audience ?? ""}
          title={
            nl
              ? "Een doelgroepcategorie verschijnt niet als filterknop: haar evenementen duiken vanzelf op bij de leden die erbij horen."
              : "An audience category is not a filter button: its events surface automatically for the members it applies to."
          }
        >
          <option value="">{nl ? "Gewoon thema" : "Regular theme"}</option>
          <option value="FIRST_YEARS">{nl ? "Eerstejaars" : "First years"}</option>
          <option value="INTERNATIONALS">{nl ? "Internationals" : "Internationals"}</option>
        </Select>
      </div>
      <label className="inline-flex items-center gap-2 self-end pb-2 text-sm">
        <input
          type="checkbox"
          name="showOnCalendarPage"
          defaultChecked={category?.showOnCalendarPage ?? true}
        />
        {nl ? "Als filter tonen" : "Show as filter"}
      </label>
    </SaveForm>
  );
}
