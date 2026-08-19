"use client";

import { useState, useTransition } from "react";
import { Button, Card, ConfirmDialog, Input, Label, Textarea } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import { deleteHeaderTabAction, saveHeaderTabAction } from "@/app/actions/pages";
import { SAVE_IDLE } from "@/lib/saveState";
import { contentErrorMessages } from "./messages";
import type { TabNode } from "./ContentManager";

/** Categoriepagina bewerken: wat er in de header staat en wat de pagina zelf toont. */
export function TabInspector({
  locale,
  tab,
  onClose,
}: {
  locale: Locale;
  tab: TabNode | null;
  onClose: () => void;
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);

  return (
    <Card className="p-5">
      <InspectorHead
        title={tab ? tab.labelNl : nl ? "Nieuwe categorie" : "New category"}
        subtitle={tab ? `/${tab.slug}` : undefined}
        onClose={onClose}
      />

      <SaveForm
        action={saveHeaderTabAction}
        className="space-y-5"
        submitLabel={dict.admin.save}
        savingLabel={dict.common.saving}
        savedMessage={dict.common.saved}
        errorMessages={contentErrorMessages(locale)}
        fallbackErrorMessage={dict.common.saveError}
        // Zie PageInspector: een nieuwe categorie bestaat na het opslaan.
        onSuccess={tab ? undefined : onClose}
      >
        {tab && <input type="hidden" name="id" value={tab.id} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="labelNl">{nl ? "Label (NL)" : "Label (NL)"}</Label>
            <Input id="labelNl" name="labelNl" defaultValue={tab?.labelNl ?? ""} required />
          </div>
          <div>
            <Label htmlFor="labelEn">{nl ? "Label (EN)" : "Label (EN)"}</Label>
            <Input id="labelEn" name="labelEn" defaultValue={tab?.labelEn ?? ""} required />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={tab?.slug ?? ""}
              pattern="[a-z0-9]([a-z0-9\-]*[a-z0-9])?"
              required
            />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl ? "De categoriepagina komt op /" : "The category page lives at /"}
              {tab?.slug ?? "..."}
            </p>
          </div>
          <div>
            <Label htmlFor="code">Code</Label>
            {tab ? (
              <>
                {/* Readonly: de seed upsert op code en code filtert erop. */}
                <Input id="code" value={tab.code} readOnly disabled />
                <input type="hidden" name="code" value={tab.code} />
                <p className="mt-1 text-xs text-[#5c667f]">
                  {nl
                    ? "Vast: de seed en de code verwijzen hiernaar."
                    : "Fixed: the seed and the code refer to this."}
                </p>
              </>
            ) : (
              <Input id="code" name="code" placeholder="BV_NIEUW" required />
            )}
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="visible" defaultChecked={tab?.visible ?? true} />
          {nl ? "Zichtbaar in de header" : "Visible in the header"}
        </label>

        <div>
          <Label htmlFor="externalUrl">
            {nl ? "Linkt naar externe site" : "Links to an external site"}
          </Label>
          <Input
            id="externalUrl"
            name="externalUrl"
            type="url"
            placeholder="https://career.vtk.be"
            defaultValue={tab?.externalUrl ?? ""}
          />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl
              ? "Laat leeg voor een gewone tab. Vul je iets in, dan opent de headerknop die site in een nieuw tabblad en gaat hij niet naar de categoriepagina."
              : "Leave empty for a normal tab. When filled in, the header button opens that site in a new tab instead of the category page."}
          </p>
        </div>

        <fieldset className="space-y-3 border-t border-vtk-blue/10 pt-5">
          <legend className="text-sm font-semibold text-vtk-ink">
            {nl ? "Extra items in het menu" : "Extra items in the menu"}
          </legend>
          <p className="text-xs text-[#5c667f]">
            {nl
              ? "De pagina's onder deze categorie staan automatisch in het uitklapmenu. Hier voeg je de rest toe: een andere site (cudi.vtk.be) of een vaste route op deze site die geen CMS-pagina is (/praesidium, /piano). Zo'n route vind je niet bij \"Pagina toevoegen\"."
              : "The pages under this category are listed in the dropdown automatically. Add the rest here: another site (cudi.vtk.be) or a built-in route on this site that is not a CMS page (/praesidium, /piano). You will not find such a route under \"Add page\"."}
          </p>
          <MenuLinkRows nl={nl} initial={tab?.links ?? []} />
        </fieldset>

        <fieldset className="space-y-4 border-t border-vtk-blue/10 pt-5">
          <legend className="text-sm font-semibold text-vtk-ink">
            {nl ? "Op de categoriepagina" : "On the category page"}
          </legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="introNl">{nl ? "Intro (NL)" : "Intro (NL)"}</Label>
              <Textarea id="introNl" name="introNl" rows={3} defaultValue={tab?.introNl ?? ""} />
            </div>
            <div>
              <Label htmlFor="introEn">{nl ? "Intro (EN)" : "Intro (EN)"}</Label>
              <Textarea id="introEn" name="introEn" rows={3} defaultValue={tab?.introEn ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="ctaLabelNl">{nl ? "Knoptekst (NL)" : "Button label (NL)"}</Label>
              <Input id="ctaLabelNl" name="ctaLabelNl" defaultValue={tab?.ctaLabelNl ?? ""} />
            </div>
            <div>
              <Label htmlFor="ctaLabelEn">{nl ? "Knoptekst (EN)" : "Button label (EN)"}</Label>
              <Input id="ctaLabelEn" name="ctaLabelEn" defaultValue={tab?.ctaLabelEn ?? ""} />
            </div>
            <div>
              <Label htmlFor="ctaUrl">{nl ? "Knop-URL" : "Button URL"}</Label>
              <Input
                id="ctaUrl"
                name="ctaUrl"
                placeholder={nl ? "/shift of https://..." : "/shift or https://..."}
                defaultValue={tab?.ctaUrl ?? ""}
              />
            </div>
          </div>
          <p className="text-xs text-[#5c667f]">
            {nl
              ? "De knop verschijnt enkel als er zowel een tekst als een URL is."
              : "The button only appears when both a label and a URL are set."}
          </p>
        </fieldset>
      </SaveForm>

      {tab && (
        <div className="mt-5 border-t border-vtk-blue/10 pt-5">
          <DeleteTabButton locale={locale} tab={tab} onDeleted={onClose} />
        </div>
      )}
    </Card>
  );
}

function DeleteTabButton({
  locale,
  tab,
  onDeleted,
}: {
  locale: Locale;
  tab: TabNode;
  onDeleted: () => void;
}) {
  const nl = locale === "nl";
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    const form = new FormData();
    form.append("id", tab.id);
    startTransition(async () => {
      await deleteHeaderTabAction(SAVE_IDLE, form);
      setConfirming(false);
      onDeleted();
    });
  }

  const count = tab.pages.length;
  const description = nl
    ? `De categorie "${tab.labelNl}" en haar pagina /${tab.slug} verdwijnen uit de header.` +
      (count > 0
        ? ` De ${count} pagina('s) eronder worden niet verwijderd, maar komen onder "Niet gekoppeld" te staan en zijn dan niet meer bereikbaar via de navigatie.`
        : "") +
      " Dit kan niet ongedaan gemaakt worden."
    : `The category "${tab.labelEn}" and its page /${tab.slug} will disappear from the header.` +
      (count > 0
        ? ` The ${count} page(s) below it are not deleted, but move to "Unlinked" and will no longer be reachable through the navigation.`
        : "") +
      " This cannot be undone.";

  return (
    <>
      <Button variant="ghost" size="sm" type="button" onClick={() => setConfirming(true)}>
        {nl ? "Categorie verwijderen" : "Delete category"}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={nl ? "Categorie verwijderen?" : "Delete category?"}
        description={description}
        confirmLabel={nl ? "Verwijderen" : "Delete"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

export function InspectorHead({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold text-vtk-ink">{title}</h2>
        {subtitle && <p className="truncate font-mono text-xs text-[#5c667f]">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 text-zinc-400 hover:text-zinc-700"
        aria-label="Sluiten"
      >
        ✕
      </button>
    </div>
  );
}


/**
 * Extra menu-items van een categorie. Rijen posten als `link-<i>-{labelNl,labelEn,url}`
 * plus een `linkCount`; de action vervangt de volledige lijst in die volgorde.
 */
function MenuLinkRows({
  nl,
  initial,
}: {
  nl: boolean;
  initial: Array<{ labelNl: string; labelEn: string; url: string }>;
}) {
  const [rows, setRows] = useState(initial);

  function update(index: number, patch: Partial<{ labelNl: string; labelEn: string; url: string }>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="linkCount" value={rows.length} />
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-center">
          <Input
            name={`link-${index}-labelNl`}
            value={row.labelNl}
            onChange={(event) => update(index, { labelNl: event.target.value })}
            placeholder={nl ? "Label (NL)" : "Label (NL)"}
            required
          />
          <Input
            name={`link-${index}-labelEn`}
            value={row.labelEn}
            onChange={(event) => update(index, { labelEn: event.target.value })}
            placeholder={nl ? "Label (EN)" : "Label (EN)"}
            required
          />
          <Input
            name={`link-${index}-url`}
            // Geen type="url": dat weigert een pad op deze site, en net die
            // bestemmingen (/praesidium, /piano) kan je enkel zo in het menu
            // krijgen; ze zijn geen CMS-pagina en staan dus niet in de picker.
            type="text"
            inputMode="url"
            value={row.url}
            onChange={(event) => update(index, { url: event.target.value })}
            placeholder={nl ? "/praesidium of https://..." : "/praesidium or https://..."}
            required
          />
          <IconButton
            label={nl ? "Verwijderen" : "Remove"}
            srLabel={`${nl ? "Verwijderen" : "Remove"}: ${row.labelNl || row.url}`}
            tone="danger"
            onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
          >
            <TrashIcon />
          </IconButton>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setRows((current) => [...current, { labelNl: "", labelEn: "", url: "" }])}
      >
        + {nl ? "Item toevoegen" : "Add item"}
      </Button>
    </div>
  );
}
