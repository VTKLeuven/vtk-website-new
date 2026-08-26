"use client";

import { useRef, useState, useTransition } from "react";
import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { CheckboxChip } from "@/components/profile/StudyFieldset";
import {
  savePocAction,
  deletePocAction,
  removePocRepresentativeAction,
  reorderPocsAction,
} from "@/app/actions/pocs-partners";
import { AddRepresentativeForm } from "./AddRepresentativeForm";
import { Avatar, Chevron, Modal, Panel, SearchBar, SortHeader, useTableControls } from "../admin-table";

// ---- Data shapes ------------------------------------------------------------

export type Rep = {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export type PocRow = {
  id: string;
  slug: string;
  name: string;
  nameNl: string;
  nameEn: string;
  email: string;
  order: number;
  studyProgrammes: string[];
  reps: Rep[];
  searchText: string;
};

/** Richting-waarde uit `StudyProgramme` met haar vertaalde label. */
export type ProgrammeOption = { value: string; label: string };

/**
 * De richtingen waar deze POC voor staat. Dit is de enige koppeling met een
 * studierichting: de homepage gebruikt ze om leden de POC's van hun eigen
 * richtingen te tonen.
 */
function ProgrammesField({
  options,
  selected,
  nl,
}: {
  options: ProgrammeOption[];
  selected: string[];
  nl: boolean;
}) {
  const chosen = new Set(selected);
  return (
    <div className="@container">
      <Label>{nl ? "Richtingen" : "Study programmes"}</Label>
      <p className="mb-2 text-xs text-[#5c667f]">
        {nl
          ? "Leden zien deze POC op de homepage wanneer ze een van deze richtingen op hun profiel hebben staan. Zonder richting verschijnt de POC daar bij niemand."
          : "Members see this POC on the homepage when one of these programmes is on their profile. Without a programme it appears for no one there."}
      </p>
      <div className="grid grid-cols-1 gap-2 @md:grid-cols-2 @3xl:grid-cols-3">
        {options.map((option) => (
          <CheckboxChip
            key={option.value}
            name="studyProgrammes"
            value={option.value}
            defaultChecked={chosen.has(option.value)}
            label={option.label}
          />
        ))}
      </div>
    </div>
  );
}

export type SaveLabels = {
  submitLabel: string;
  savingLabel: string;
  savedMessage: string;
  fallbackErrorMessage: string;
  errorMessages: Record<string, string>;
};

export function PocsTable({
  pocs,
  locale,
  saveLabels,
  createLabels,
  programmeOptions,
}: {
  pocs: PocRow[];
  locale: "nl" | "en";
  saveLabels: SaveLabels;
  createLabels: SaveLabels;
  programmeOptions: ProgrammeOption[];
}) {
  const nl = locale === "nl";
  const [prevPocs, setPrevPocs] = useState(pocs);
  const [items, setItems] = useState<PocRow[]>(pocs);
  const [createOpen, setCreateOpen] = useState(false);
  const [, startTransition] = useTransition();

  if (pocs !== prevPocs) {
    setPrevPocs(pocs);
    setItems(pocs);
  }

  const { query, setQuery, sort, toggleSort, filtered, isOpen, toggleRow } = useTableControls(items, {
    searchOf: (r) => r.searchText,
    nameOf: (r) => r.name,
    countOf: (r) => r.reps.length,
    locale,
  });

  const dragFrom = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const isReorderable = !query && !sort;

  function onDrop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    setOverIndex(null);
    if (from === null || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    startTransition(() => void reorderPocsAction(next.map((p) => p.id)));
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: zoeken + nieuwe POC */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder={nl ? "Zoek op naam, e-mail of opleiding" : "Search by name, email or programme"}
          ariaLabel={nl ? "POC's zoeken" : "Search POCs"}
        />
        <button type="button" className="vtk-tile-btn vtk-tile-btn-primary" onClick={() => setCreateOpen(true)}>
          {nl ? "Nieuwe POC" : "New POC"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th className="w-8" aria-hidden />
              <SortHeader label="POC" active={sort?.key === "name" ? sort.dir : null} onClick={() => toggleSort("name")} />
              <SortHeader
                label={nl ? "Studentenvertegenwoordigers" : "Student reps"}
                active={sort?.key === "count" ? sort.dir : null}
                onClick={() => toggleSort("count")}
                align="right"
              />
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {filtered.map((poc, index) => (
              <PocRowView
                key={poc.id}
                poc={poc}
                isReorderable={isReorderable}
                isOver={overIndex === index}
                onDragStart={() => {
                  dragFrom.current = index;
                }}
                onDragEnd={() => {
                  dragFrom.current = null;
                  setOverIndex(null);
                }}
                onDragOver={(e) => {
                  if (!isReorderable) return;
                  e.preventDefault();
                  if (overIndex !== index) setOverIndex(index);
                }}
                onDrop={(e) => {
                  if (!isReorderable) return;
                  e.preventDefault();
                  onDrop(index);
                }}
                isOpen={isOpen(poc.id)}
                onToggle={() => toggleRow(poc.id)}
                nl={nl}
                locale={locale}
                saveLabels={saveLabels}
                programmeOptions={programmeOptions}
              />
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-[#5c667f]">
          {query ? (nl ? "Geen POC's gevonden." : "No POCs found.") : nl ? "Nog geen POC's." : "No POCs yet."}
        </p>
      )}

      {createOpen && (
        <Modal title={nl ? "Nieuwe POC" : "New POC"} onClose={() => setCreateOpen(false)}>
          <SaveForm
            action={savePocAction}
            className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>button]:md:col-span-2 [&>button]:justify-self-start"
            {...createLabels}
            onSuccess={() => setCreateOpen(false)}
          >
            <div><Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label><Input name="nameNl" required /></div>
            <div><Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label><Input name="nameEn" required /></div>
            <div><Label>{nl ? "E-mail (optioneel)" : "Email (optional)"}</Label><Input name="email" type="email" placeholder="poc-…@vtk.be" /></div>
            <div><Label>{nl ? "Code" : "Code"}</Label><Input name="code" placeholder={nl ? "auto" : "auto"} /></div>
            <div className="md:col-span-2">
              <ProgrammesField options={programmeOptions} selected={[]} nl={nl} />
            </div>
          </SaveForm>
        </Modal>
      )}
    </div>
  );
}

function PocRowView({
  poc,
  isReorderable,
  isOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isOpen,
  onToggle,
  nl,
  locale,
  saveLabels,
  programmeOptions,
}: {
  poc: PocRow;
  isReorderable: boolean;
  isOver: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isOpen: boolean;
  onToggle: () => void;
  nl: boolean;
  locale: "nl" | "en";
  saveLabels: SaveLabels;
  programmeOptions: ProgrammeOption[];
}) {
  const detailId = `poc-detail-${poc.id}`;
  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={detailId}
        draggable={isReorderable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className={`cursor-pointer transition-colors ${
          isOver ? "border-vtk-blue bg-vtk-yellow/20" : ""
        }`}
      >
        <td className="w-8 text-center text-zinc-400" onClick={(e) => isReorderable && e.stopPropagation()}>
          {isReorderable && (
            <span
              className="cursor-grab active:cursor-grabbing hover:text-vtk-ink text-base select-none px-1"
              title={nl ? "Sleep om volgorde te wijzigen" : "Drag to reorder"}
              aria-hidden="true"
            >
              ⠿
            </span>
          )}
        </td>
        <td>
          <div className="flex items-start gap-2">
            <Chevron open={isOpen} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-vtk-ink">{poc.name}</span>
                <code className="rounded bg-vtk-blue-soft/60 px-1.5 py-0.5 text-[11px] text-[#5c667f]">{poc.slug}</code>
              </div>
            </div>
          </div>
        </td>
        <td className="text-right tabular-nums">{poc.reps.length}</td>
        <td className="text-right text-[#5c667f]">{isOpen ? (nl ? "Sluiten" : "Close") : nl ? "Details" : "Details"}</td>
      </tr>
      {isOpen && (
        <tr id={detailId}>
          <td colSpan={4} className="bg-vtk-blue-soft/20">
            <PocDetail
              poc={poc}
              nl={nl}
              locale={locale}
              saveLabels={saveLabels}
              programmeOptions={programmeOptions}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function PocDetail({
  poc,
  nl,
  locale,
  saveLabels,
  programmeOptions,
}: {
  poc: PocRow;
  nl: boolean;
  locale: "nl" | "en";
  saveLabels: SaveLabels;
  programmeOptions: ProgrammeOption[];
}) {
  return (
    <div className="space-y-4 py-1">
      {/* Vertegenwoordigers */}
      <Panel
        title={nl ? "Vertegenwoordigers" : "Representatives"}
        count={poc.reps.length}
        canEdit
        editLabel={nl ? "Bewerken" : "Edit"}
        doneLabel={nl ? "Klaar" : "Done"}
      >
        {(editing) =>
          editing ? (
            <div className="space-y-2">
              {poc.reps.length > 0 ? (
                <ul className="divide-y divide-vtk-blue/10">
                  {poc.reps.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 py-2">
                      <Avatar name={r.name} avatarUrl={r.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-vtk-ink">
                          {r.name}
                        </div>
                        <div className="truncate text-xs text-[#5c667f]">{r.email}</div>
                      </div>
                      <DeleteIconButton
                        action={removePocRepresentativeAction}
                        fields={{ id: r.id }}
                        label={nl ? "Verwijderen" : "Remove"}
                        srLabel={`${nl ? "Verwijderen" : "Remove"}: ${r.name}`}
                        title={nl ? "Vertegenwoordiger verwijderen?" : "Remove representative?"}
                        description={
                          nl
                            ? `${r.name} wordt van deze POC gehaald en verdwijnt van de publieke POC-pagina. Het account zelf blijft bestaan.`
                            : `${r.name} will be removed from this POC and disappears from the public POC page. The account itself is not deleted.`
                        }
                        confirmLabel={nl ? "Verwijderen" : "Remove"}
                        cancelLabel={nl ? "Annuleren" : "Cancel"}
                        successMessage={nl ? "Vertegenwoordiger verwijderd" : "Representative removed"}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#5c667f]">{nl ? "Nog geen vertegenwoordigers." : "No representatives yet."}</p>
              )}
              <AddRepresentativeForm pocId={poc.id} locale={locale} />
            </div>
          ) : poc.reps.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {poc.reps.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-full border border-vtk-blue/12 bg-white py-1 pl-1 pr-3">
                  <Avatar name={r.name} avatarUrl={r.avatarUrl} sm />
                  <span className="text-sm text-vtk-ink">{r.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#5c667f]">{nl ? "Nog geen vertegenwoordigers." : "No representatives yet."}</p>
          )
        }
      </Panel>

      {/* POC-instellingen */}
      <details className="rounded-xl border border-vtk-blue/12 bg-white">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-vtk-ink">
          {nl ? "POC-instellingen" : "POC settings"}
        </summary>
        <div className="space-y-4 p-4">
          <SaveForm
            action={savePocAction}
            className="grid grid-cols-1 gap-3 md:grid-cols-6 [&>button]:md:col-span-6 [&>button]:justify-self-start"
            {...saveLabels}
          >
            <input type="hidden" name="id" value={poc.id} />
            <div className="md:col-span-3"><Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label><Input name="nameNl" defaultValue={poc.nameNl} required /></div>
            <div className="md:col-span-3"><Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label><Input name="nameEn" defaultValue={poc.nameEn} /></div>
            <div className="md:col-span-6"><Label>Slug</Label><Input name="slug" defaultValue={poc.slug} required /></div>
            <div className="md:col-span-6">
              <Label>{nl ? "E-mailadres van de POC" : "POC email address"}</Label>
              <Input name="email" type="email" defaultValue={poc.email} placeholder="wtk-poc@vtk.be" autoComplete="off" />
            </div>
            <div className="md:col-span-6">
              <ProgrammesField options={programmeOptions} selected={poc.studyProgrammes} nl={nl} />
            </div>
          </SaveForm>

          <DeleteButton
            action={deletePocAction}
            fields={{ id: poc.id }}
            title={nl ? "POC verwijderen?" : "Delete POC?"}
            description={
              nl
                ? `"${poc.name}" wordt permanent verwijderd, samen met de ${poc.reps.length} vertegenwoordiger(s) die eraan hangen. Dit kan niet ongedaan gemaakt worden.`
                : `"${poc.name}" will be permanently deleted, along with its ${poc.reps.length} representative(s). This cannot be undone.`
            }
            confirmLabel={nl ? "Verwijderen" : "Delete"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
            successMessage={nl ? "POC verwijderd" : "POC deleted"}
          >
            {nl ? "POC verwijderen" : "Delete POC"}
          </DeleteButton>
        </div>
      </details>
    </div>
  );
}
