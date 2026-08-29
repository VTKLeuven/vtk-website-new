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
  audience: "FIRST_YEARS" | "INTERNATIONALS" | "LAST_YEARS" | "ALUMNI" | null;
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
  kind,
}: {
  category?: CategoryRow;
  locale: "nl" | "en";
  kind: "category" | "audience";
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);

  return (
    <SaveForm
      action={saveCalendarCategoryAction}
      className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_1fr_auto_10rem_auto] [&>button]:justify-self-start"
      submitLabel={
        category
          ? nl
            ? "Opslaan"
            : "Save"
          : kind === "category"
            ? nl
              ? "Categorie toevoegen"
              : "Add category"
            : nl
              ? "Doelgroep toevoegen"
              : "Add audience"
      }
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
      <input type="hidden" name="kind" value={kind} />
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
      {kind === "audience" ? (
        <div>
          <Label>{nl ? "Doelgroep" : "Audience"}</Label>
          <Select name="audience" defaultValue={category?.audience ?? "FIRST_YEARS"} required>
            <option value="FIRST_YEARS">{nl ? "Eerstejaars" : "First years"}</option>
            <option value="INTERNATIONALS">Internationals</option>
            <option value="LAST_YEARS">{nl ? "Laatstejaars" : "Last years"}</option>
            <option value="ALUMNI">Alumni</option>
          </Select>
        </div>
      ) : (
        <label className="inline-flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            name="showOnCalendarPage"
            defaultChecked={category?.showOnCalendarPage ?? true}
          />
          {nl ? "Als filter tonen" : "Show as filter"}
        </label>
      )}
    </SaveForm>
  );
}
