"use client";

import { Input, Label, Select } from "@vtk/ui";
import { getDictionary } from "@vtk/i18n";
import { StorageImageField } from "@/components/admin/StorageImageField";
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
  /** De standaardbanner van deze categorie; enkel een thema draagt er een. */
  imageKey: string | null;
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
  siteDefaultImage,
}: {
  category?: CategoryRow;
  locale: "nl" | "en";
  kind: "category" | "audience";
  /** De sitebrede standaardfoto, die geldt zolang dit thema er geen heeft. */
  siteDefaultImage: string;
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);

  return (
    <SaveForm
      action={saveCalendarCategoryAction}
      className="space-y-4"
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
      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_1fr_auto_10rem]">
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
      </div>
      {/* Enkel een thema draagt een standaardbanner: een doelgroep zegt voor wie
          het evenement is, niet hoe het eruitziet. */}
      {kind === "category" && (
        <StorageImageField
          defaultKey={category?.imageKey}
          locale={locale}
          label={nl ? "Standaardbanner" : "Default banner"}
          fallbackUrl={siteDefaultImage}
          emptyHint={nl ? "Sitebrede foto" : "Site-wide photo"}
          srContext={category ? (nl ? category.nameNl : category.nameEn) : undefined}
          // De volle uitleg staat één keer, bij "Nieuwe categorie"; ze per rij
          // herhalen maakt van de lijst zeven keer dezelfde alinea.
          helpText={
            category
              ? undefined
              : nl
                ? "Evenementen in deze categorie zonder eigen affiche tonen deze foto, op de kalender, de homepage en in de app. Zonder upload krijgen ze de sitebrede standaardfoto uit /admin/home. Neem minstens 1600 px breed; draagt een evenement meerdere categorieën, dan wint de hoogste in deze lijst."
                : "Events in this category without their own poster show this photo, on the calendar, the home page and in the app. Without an upload they get the site-wide default from /admin/home. Use at least 1600 px wide; if an event carries several categories, the highest one in this list wins."
          }
          minWidth={1600}
        />
      )}
    </SaveForm>
  );
}
