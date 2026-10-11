"use client";

import { useState, type ReactNode } from "react";
import { Button, Card, Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { deletePalPlusTagAction, savePalPlusTagAction } from "@/app/actions/palPlus";
import { PAL_PLUS_LIMITS } from "@/lib/palPlus";
import { palPlusListErrors } from "@/lib/palPlusMessages";

export type PalPlusTagView = { id: string; label: string; active: boolean };
/**
 * De korte lijst die Onderwijs naast de vakken bijhoudt: de snelle tags in het
 * aanvraagformulier.
 *
 * Een tag mag altijd verwijderd worden: een aanvraag bewaart de tekst van haar
 * tags, dus wat al ingediend werd, verandert niet mee.
 */
export function TagsCard({ nl, tags }: { nl: boolean; tags: PalPlusTagView[] }) {
  return (
    <ListCard
      nl={nl}
      title={nl ? "Snelle tags" : "Quick tags"}
      intro={
        nl
          ? "De tags die iemand met één tik kiest in het formulier (Theorie, Oefeningen). Eigen tags intikken kan altijd; die staan hier niet. Hernoemen of weghalen verandert niets aan wat al ingediend werd."
          : "The tags someone picks with one tap in the form (Theory, Exercises). Typing their own tags is always possible; those are not listed here. Renaming or removing one does not change what was already submitted."
      }
      addLabel={nl ? "Tag toevoegen" : "Add tag"}
      empty={nl ? "Nog geen snelle tags: het formulier toont dan enkel het veld om zelf te tikken." : "No quick tags yet: the form then only shows the field to type your own."}
      columns={[nl ? "Tag" : "Tag"]}
      items={tags.map((tag) => ({
        id: tag.id,
        active: tag.active,
        cells: [tag.label],
        title: tag.label,
        editor: (done) => <TagForm nl={nl} tag={tag} onDone={done} />,
        remove: (
          <DeleteButton
            action={deletePalPlusTagAction}
            fields={{ id: tag.id }}
            title={nl ? "Tag verwijderen?" : "Delete tag?"}
            description={
              nl
                ? `"${tag.label}" verdwijnt uit de snelle keuzes. Aanvragen en sessies die de tag al hebben, houden ze.`
                : `"${tag.label}" leaves the quick choices. Requests and sessions that already have it keep it.`
            }
            confirmLabel={nl ? "Verwijderen" : "Delete"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
            successMessage={nl ? "Tag verwijderd." : "Tag deleted."}
            errorMessages={palPlusListErrors(nl)}
            errorFallback={nl ? "Niet verwijderd." : "Not deleted."}
          >
            {nl ? "Tag verwijderen" : "Delete tag"}
          </DeleteButton>
        ),
      }))}
      newEditor={(done) => <TagForm nl={nl} tag={null} onDone={done} />}
    />
  );
}

type ListItem = {
  id: string;
  active: boolean;
  title: string;
  cells: string[];
  editor: (done: () => void) => ReactNode;
  remove: ReactNode;
};

/** Dezelfde vorm als de vakkenlijst: een klik op de rij opent het item, verwijderen staat daarin. */
function ListCard({
  nl,
  title,
  intro,
  addLabel,
  empty,
  columns,
  items,
  newEditor,
}: {
  nl: boolean;
  title: string;
  intro: string;
  addLabel: string;
  empty: string;
  columns: string[];
  items: ListItem[];
  newEditor: (done: () => void) => ReactNode;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id));

  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button type="button" size="sm" onClick={() => setAdding((prev) => !prev)}>
          {adding ? (nl ? "Annuleren" : "Cancel") : addLabel}
        </Button>
      </div>
      <p className="mb-4 text-sm text-vtk-muted">{intro}</p>

      {adding && (
        <div className="mb-4 rounded-2xl border border-vtk-blue/15 p-4">{newEditor(() => setAdding(false))}</div>
      )}

      {items.length === 0 ? (
        !adding && <p className="text-sm text-vtk-muted">{empty}</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="vtk-palplus-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const open = expanded === item.id;
                return (
                  <ListRows key={item.id} item={item} open={open} columns={columns} nl={nl} onToggle={() => toggle(item.id)} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ListRows({
  item,
  open,
  columns,
  nl,
  onToggle,
}: {
  item: ListItem;
  open: boolean;
  columns: string[];
  nl: boolean;
  onToggle: () => void;
}) {
  const [first, ...rest] = item.cells;
  return (
    <>
      <tr
        className="vtk-palplus-row"
        data-open={open ? "true" : undefined}
        data-inactive={item.active ? undefined : "true"}
        onClick={onToggle}
      >
        <th scope="row">
          <button
            type="button"
            className="vtk-palplus-rowtitle"
            aria-expanded={open}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            {first}
          </button>
          {!item.active && <span className="vtk-palplus-off">{nl ? "Uit" : "Off"}</span>}
        </th>
        {rest.map((cell, index) => (
          <td key={index} data-label={columns[index + 1]}>
            {cell}
          </td>
        ))}
      </tr>
      {open && (
        <tr className="vtk-palplus-editor">
          <td colSpan={columns.length}>
            {item.editor(onToggle)}
            <div className="mt-4 flex justify-end border-t border-vtk-blue/10 pt-3">{item.remove}</div>
          </td>
        </tr>
      )}
    </>
  );
}

function TagForm({ nl, tag, onDone }: { nl: boolean; tag: PalPlusTagView | null; onDone: () => void }) {
  const prefix = tag?.id ?? "new";
  return (
    <SaveForm
      action={savePalPlusTagAction}
      submitLabel={tag ? (nl ? "Opslaan" : "Save") : nl ? "Toevoegen" : "Add"}
      savingLabel={nl ? "Opslaan…" : "Saving…"}
      savedMessage={tag ? (nl ? "Tag opgeslagen." : "Tag saved.") : nl ? "Tag toegevoegd." : "Tag added."}
      errorMessages={palPlusListErrors(nl)}
      fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
      resetOnSuccess={tag === null}
      onSuccess={onDone}
      className="space-y-3"
    >
      {tag && <input type="hidden" name="id" value={tag.id} />}
      <div className="sm:max-w-72">
        <Label htmlFor={`pal-tag-${prefix}`}>{nl ? "Tag" : "Tag"}</Label>
        <Input
          id={`pal-tag-${prefix}`}
          name="label"
          defaultValue={tag?.label ?? ""}
          maxLength={PAL_PLUS_LIMITS.tag}
          placeholder={nl ? "Oefeningen" : "Exercises"}
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-vtk-ink">
        <input type="checkbox" name="active" defaultChecked={tag?.active ?? true} />
        <span>{nl ? "Bij de snelle keuzes in het formulier" : "Among the quick choices in the form"}</span>
      </label>
    </SaveForm>
  );
}
