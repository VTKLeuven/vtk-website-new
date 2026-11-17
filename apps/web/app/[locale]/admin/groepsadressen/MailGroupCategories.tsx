"use client";

import { useState } from "react";
import { Input, Label } from "@vtk/ui";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { SaveForm } from "@/components/ui/SaveForm";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { InfoTip } from "@/components/ui/InfoTip";
import { PencilIcon } from "@/components/ui/icons";
import { createCategoryAction, deleteCategoryAction, saveCategoryAction } from "./bulkActions";

type CategoryLeaf = {
  id: string;
  name: string;
  /** De werkgroep waartoe de categorie hoort; leeg = geen. */
  ownerId: string | null;
  ownerName: string | null;
  /** Groepsadressen rechtstreeks in deze categorie. */
  count: number;
};

export type CategoryNode = CategoryLeaf & { children: CategoryLeaf[] };

type Werkgroep = { id: string; name: string; prefix: string | null };

/**
 * Categorieën aanmaken, bewerken en weghalen. Toewijzen gebeurt in de tabel
 * zelf (aanvinken, dan "In categorie zetten"), want dat doe je per tientallen.
 *
 * Een categorie kan bij een werkgroep horen (Werkgroepen › Biomedix). Die komt
 * dan op de adressen in de categorie, zodat niemand ze adres per adres moet
 * invullen; zie `saveCategoryAction`.
 */
export function MailGroupCategories({
  nl,
  categories,
  werkgroepen,
}: {
  nl: boolean;
  categories: CategoryNode[];
  werkgroepen: Werkgroep[];
}) {
  const subCount = categories.reduce((n, c) => n + c.children.length, 0);
  const t = nl
    ? {
        title: "Categorieën",
        summary:
          categories.length === 0
            ? "Nog geen categorieën. Maak er een, bv. Praesidium met Activiteiten eronder."
            : `${categories.length} ${categories.length === 1 ? "categorie" : "categorieën"}, ${subCount} ${subCount === 1 ? "subcategorie" : "subcategorieën"}`,
        name: "Naam",
        parent: "Onder",
        owner: "Werkgroep",
        noOwner: "Geen werkgroep",
        ownerTip: "Wat een werkgroep op een categorie doet",
        ownerHelp:
          "Een werkgroep komt op elk adres in deze categorie zonder werkgroep, en op de adressen die er later in komen. Een adres met een andere werkgroep houdt die. Een subcategorie kies je apart.",
        top: "Bovenaan (hoofdcategorie)",
        add: "Categorie toevoegen",
        adding: "Bezig met toevoegen...",
        added: "Categorie toegevoegd.",
        save: "Opslaan",
        saving: "Bezig met opslaan...",
        saved: "Opgeslagen.",
        cancel: "Annuleren",
        rename: "Bewerken",
        remove: "Verwijderen",
        removeTitle: (name: string) => `Categorie ${name} verwijderen?`,
        removeBody: (c: { ownerName: string | null; children?: unknown[] }, total: number) =>
          `De groepsadressen zelf blijven bestaan, in de site en in Google; ${total} ${total === 1 ? "adres staat" : "adressen staan"} daarna zonder categorie.${
            c.children && c.children.length ? ` De ${c.children.length} subcategorieën gaan mee weg.` : ""
          }${c.ownerName ? ` ${c.ownerName} blijft de adressen beheren die het nu beheert.` : ""}`,
        removed: "Categorie verwijderd.",
        addresses: (n: number) => `${n} ${n === 1 ? "adres" : "adressen"}`,
        errors: {
          INVALID_NAME: "Geef de categorie een naam van hoogstens 60 tekens.",
          DUPLICATE_CATEGORY: "Daar bestaat al een categorie met die naam.",
          TOO_DEEP: "Een subcategorie kan zelf geen subcategorieën hebben.",
          INVALID_OWNER: "Die werkgroep bestaat niet meer. Herlaad de pagina en kies opnieuw.",
        } as Record<string, string>,
        failed: "Opslaan is mislukt.",
      }
    : {
        title: "Categories",
        summary:
          categories.length === 0
            ? "No categories yet. Create one, e.g. Praesidium with Activities under it."
            : `${categories.length} ${categories.length === 1 ? "category" : "categories"}, ${subCount} ${subCount === 1 ? "subcategory" : "subcategories"}`,
        name: "Name",
        parent: "Under",
        owner: "Work group",
        noOwner: "No work group",
        ownerTip: "What a work group on a category does",
        ownerHelp:
          "A work group is set on every address in this category without a work group, and on addresses added to it later. An address with another work group keeps it. Subcategories are chosen separately.",
        top: "At the top (main category)",
        add: "Add category",
        adding: "Adding...",
        added: "Category added.",
        save: "Save",
        saving: "Saving...",
        saved: "Saved.",
        cancel: "Cancel",
        rename: "Edit",
        remove: "Delete",
        removeTitle: (name: string) => `Delete category ${name}?`,
        removeBody: (c: { ownerName: string | null; children?: unknown[] }, total: number) =>
          `The group addresses themselves stay, on the site and in Google; ${total} ${total === 1 ? "address is" : "addresses are"} without a category afterwards.${
            c.children && c.children.length ? ` Its ${c.children.length} subcategories are deleted too.` : ""
          }${c.ownerName ? ` ${c.ownerName} keeps managing the addresses it manages now.` : ""}`,
        removed: "Category deleted.",
        addresses: (n: number) => `${n} ${n === 1 ? "address" : "addresses"}`,
        errors: {
          INVALID_NAME: "Give the category a name of at most 60 characters.",
          DUPLICATE_CATEGORY: "A category with that name already exists there.",
          TOO_DEEP: "A subcategory cannot have subcategories itself.",
          INVALID_OWNER: "That work group no longer exists. Reload the page and choose again.",
        } as Record<string, string>,
        failed: "Saving failed.",
      };

  return (
    <AdminDisclosure
      defaultOpen={categories.length === 0}
      summary={
        <span>
          <span className="font-semibold text-vtk-ink">{t.title}</span>
          <span className="block text-sm text-zinc-500">{t.summary}</span>
        </span>
      }
    >
      <div className="space-y-4">
        {categories.length > 0 && (
          <ul className="divide-y divide-vtk-blue/10 rounded-xl border border-vtk-blue/15 bg-white">
            {categories.map((c) => (
              <li key={c.id}>
                <CategoryRow
                  nl={nl}
                  t={t}
                  category={c}
                  werkgroepen={werkgroepen}
                  deleteBody={t.removeBody(c, c.count + c.children.reduce((n, s) => n + s.count, 0))}
                />
                {c.children.length > 0 && (
                  <ul className="border-t border-vtk-blue/5">
                    {c.children.map((s) => (
                      <li key={s.id} className="pl-6">
                        <CategoryRow
                          nl={nl}
                          t={t}
                          category={s}
                          werkgroepen={werkgroepen}
                          deleteBody={t.removeBody(s, s.count)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        <SaveForm
          action={createCategoryAction}
          submitLabel={t.add}
          savingLabel={t.adding}
          savedMessage={t.added}
          errorMessages={t.errors}
          fallbackErrorMessage={t.failed}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="w-56">
            <Label>{t.name}</Label>
            <Input name="name" required maxLength={60} placeholder={nl ? "bv. Activiteiten" : "e.g. Activities"} />
          </div>
          <div className="w-64">
            <Label>{t.parent}</Label>
            <ThemedSelect
              name="parentId"
              defaultValue=""
              ariaLabel={t.parent}
              options={[{ value: "", label: t.top }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
          <div className="w-56">
            <Label>{t.owner}</Label>
            <ThemedSelect
              name="ownerGroupId"
              defaultValue=""
              ariaLabel={t.owner}
              options={ownerOptions(werkgroepen, t.noOwner, null)}
            />
          </div>
        </SaveForm>
      </div>
    </AdminDisclosure>
  );
}

function ownerOptions(werkgroepen: Werkgroep[], noOwner: string, current: CategoryLeaf | null) {
  const options = [
    { value: "", label: noOwner },
    ...werkgroepen.map((w) => ({ value: w.id, label: w.prefix ? `${w.name} (${w.prefix}.)` : w.name })),
  ];
  // Een werkgroep die intussen niet meer actief is, blijft kiesbaar zolang de
  // categorie ze heeft: anders zou opslaan ze stil weghalen.
  if (current?.ownerId && !werkgroepen.some((w) => w.id === current.ownerId)) {
    options.push({ value: current.ownerId, label: current.ownerName ?? current.ownerId });
  }
  return options;
}

function CategoryRow({
  nl,
  t,
  category,
  werkgroepen,
  deleteBody,
}: {
  nl: boolean;
  t: {
    rename: string;
    remove: string;
    save: string;
    saving: string;
    saved: string;
    cancel: string;
    removed: string;
    failed: string;
    owner: string;
    noOwner: string;
    ownerHelp: string;
    ownerTip: string;
    errors: Record<string, string>;
    removeTitle: (name: string) => string;
    addresses: (n: number) => string;
  };
  category: CategoryLeaf;
  werkgroepen: Werkgroep[];
  deleteBody: string;
}) {
  const { id, name, count } = category;
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <SaveForm
        action={saveCategoryAction}
        submitLabel={t.save}
        savingLabel={t.saving}
        savedMessage={t.saved}
        errorMessages={t.errors}
        fallbackErrorMessage={t.failed}
        resetOnSuccess={false}
        onSuccess={() => setEditing(false)}
        submitSize="sm"
        className="flex flex-wrap items-end gap-2 px-4 py-3"
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="locale" value={nl ? "nl" : "en"} />
        <div className="w-56">
          <Label>{nl ? "Naam" : "Name"}</Label>
          <Input name="name" defaultValue={name} required maxLength={60} autoFocus />
        </div>
        <div className="w-64">
          <div className="flex items-center gap-1">
            <Label>{t.owner}</Label>
            <InfoTip label={t.ownerTip} className="mb-1.5">
              <p>{t.ownerHelp}</p>
            </InfoTip>
          </div>
          <ThemedSelect
            name="ownerGroupId"
            defaultValue={category.ownerId ?? ""}
            ariaLabel={t.owner}
            options={ownerOptions(werkgroepen, t.noOwner, category)}
          />
        </div>
        <button type="button" className="vtk-link mb-2.5 text-sm" onClick={() => setEditing(false)}>
          {t.cancel}
        </button>
      </SaveForm>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="min-w-0 flex-1 text-sm text-vtk-ink">
        {name}
        {category.ownerName && (
          <span className="ml-2 text-xs text-zinc-500">
            {nl ? "werkgroep" : "work group"} {category.ownerName}
          </span>
        )}
      </span>
      <span className="text-xs tabular-nums text-zinc-500">{t.addresses(count)}</span>
      <IconButton label={t.rename} srLabel={`${t.rename}: ${name}`} onClick={() => setEditing(true)}>
        <PencilIcon />
      </IconButton>
      <DeleteIconButton
        action={deleteCategoryAction}
        fields={{ id }}
        label={t.remove}
        srLabel={`${t.remove}: ${name}`}
        title={t.removeTitle(name)}
        description={deleteBody}
        confirmLabel={t.remove}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        successMessage={t.removed}
      />
    </div>
  );
}
