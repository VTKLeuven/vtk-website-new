"use client";

import { useState } from "react";
import { Input, Label } from "@vtk/ui";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { SaveForm } from "@/components/ui/SaveForm";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { PencilIcon } from "@/components/ui/icons";
import { createCategoryAction, deleteCategoryAction, renameCategoryAction } from "./bulkActions";

export type CategoryNode = {
  id: string;
  name: string;
  /** Groepsadressen rechtstreeks in deze categorie. */
  count: number;
  children: { id: string; name: string; count: number }[];
};

/**
 * Categorieën aanmaken, hernoemen en weghalen. Toewijzen gebeurt in de tabel
 * zelf (aanvinken, dan "In categorie zetten"), want dat doe je per tientallen.
 */
export function MailGroupCategories({ nl, categories }: { nl: boolean; categories: CategoryNode[] }) {
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
        top: "Bovenaan (hoofdcategorie)",
        add: "Categorie toevoegen",
        adding: "Bezig met toevoegen...",
        added: "Categorie toegevoegd.",
        save: "Opslaan",
        saving: "Bezig met opslaan...",
        saved: "Hernoemd.",
        cancel: "Annuleren",
        rename: "Hernoemen",
        remove: "Verwijderen",
        removeTitle: (name: string) => `Categorie ${name} verwijderen?`,
        removeBody: (c: CategoryNode | { name: string; count: number; children?: unknown[] }, total: number) =>
          `De groepsadressen zelf blijven bestaan, in de site en in Google; ${total} ${total === 1 ? "adres staat" : "adressen staan"} daarna zonder categorie.${
            c.children && c.children.length ? ` De ${c.children.length} subcategorieën gaan mee weg.` : ""
          }`,
        removed: "Categorie verwijderd.",
        addresses: (n: number) => `${n} ${n === 1 ? "adres" : "adressen"}`,
        errors: {
          INVALID_NAME: "Geef de categorie een naam van hoogstens 60 tekens.",
          DUPLICATE_CATEGORY: "Daar bestaat al een categorie met die naam.",
          TOO_DEEP: "Een subcategorie kan zelf geen subcategorieën hebben.",
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
        top: "At the top (main category)",
        add: "Add category",
        adding: "Adding...",
        added: "Category added.",
        save: "Save",
        saving: "Saving...",
        saved: "Renamed.",
        cancel: "Cancel",
        rename: "Rename",
        remove: "Delete",
        removeTitle: (name: string) => `Delete category ${name}?`,
        removeBody: (c: CategoryNode | { name: string; count: number; children?: unknown[] }, total: number) =>
          `The group addresses themselves stay, on the site and in Google; ${total} ${total === 1 ? "address is" : "addresses are"} without a category afterwards.${
            c.children && c.children.length ? ` Its ${c.children.length} subcategories are deleted too.` : ""
          }`,
        removed: "Category deleted.",
        addresses: (n: number) => `${n} ${n === 1 ? "address" : "addresses"}`,
        errors: {
          INVALID_NAME: "Give the category a name of at most 60 characters.",
          DUPLICATE_CATEGORY: "A category with that name already exists there.",
          TOO_DEEP: "A subcategory cannot have subcategories itself.",
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
                  id={c.id}
                  name={c.name}
                  count={c.count}
                  deleteBody={t.removeBody(c, c.count + c.children.reduce((n, s) => n + s.count, 0))}
                />
                {c.children.length > 0 && (
                  <ul className="border-t border-vtk-blue/5">
                    {c.children.map((s) => (
                      <li key={s.id} className="pl-6">
                        <CategoryRow
                          nl={nl}
                          t={t}
                          id={s.id}
                          name={s.name}
                          count={s.count}
                          deleteBody={t.removeBody({ name: s.name, count: s.count }, s.count)}
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
        </SaveForm>
      </div>
    </AdminDisclosure>
  );
}

function CategoryRow({
  nl,
  t,
  id,
  name,
  count,
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
    errors: Record<string, string>;
    removeTitle: (name: string) => string;
    addresses: (n: number) => string;
  };
  id: string;
  name: string;
  count: number;
  deleteBody: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <SaveForm
        action={renameCategoryAction}
        submitLabel={t.save}
        savingLabel={t.saving}
        savedMessage={t.saved}
        errorMessages={t.errors}
        fallbackErrorMessage={t.failed}
        resetOnSuccess={false}
        onSuccess={() => setEditing(false)}
        submitSize="sm"
        className="flex flex-wrap items-center gap-2 px-4 py-2"
      >
        <input type="hidden" name="id" value={id} />
        <div className="w-56">
          <Input name="name" defaultValue={name} required maxLength={60} aria-label={t.rename} autoFocus />
        </div>
        <button type="button" className="vtk-link text-sm" onClick={() => setEditing(false)}>
          {t.cancel}
        </button>
      </SaveForm>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="min-w-0 flex-1 text-sm text-vtk-ink">{name}</span>
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
