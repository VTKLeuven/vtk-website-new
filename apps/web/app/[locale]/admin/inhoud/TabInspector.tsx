"use client";

import { useState, useTransition } from "react";
import { Button, Card, ConfirmDialog, Input, Label, Textarea } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
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
                type="url"
                placeholder="https://..."
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
