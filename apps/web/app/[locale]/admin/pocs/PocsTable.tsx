"use client";

import { useState } from "react";
import { Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { CheckboxChip } from "@/components/profile/StudyFieldset";
import { savePocAction, deletePocAction, removePocRepresentativeAction } from "@/app/actions/pocs-partners";
import { AddRepresentativeForm } from "./AddRepresentativeForm";
import { Avatar, Chevron, Modal, Panel, SearchBar, SortHeader, useTableControls } from "../admin-table";

// ---- Data shapes ------------------------------------------------------------

export type Rep = {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string | null;
};

export type PocRow = {
  id: string;
  slug: string;
  studyTrack: string;
  name: string;
  nameNl: string;
  nameEn: string;
  description: string | null;
  descriptionNl: string;
  descriptionEn: string;
  order: number;
  studyProgrammes: string[];
  reps: Rep[];
  searchText: string;
};

/** Richting-waarde uit `StudyProgramme` met haar vertaalde label. */
export type ProgrammeOption = { value: string; label: string };

/**
 * De richtingen waar deze POC voor staat. Dit is de koppeling die de homepage
 * gebruikt om leden de POC's van hun eigen richtingen te tonen; `studyTrack`
 * ernaast blijft de vrije tekst die op de POC-pagina zelf verschijnt.
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
  const [createOpen, setCreateOpen] = useState(false);
  const { query, setQuery, sort, toggleSort, filtered, isOpen, toggleRow } = useTableControls(pocs, {
    searchOf: (r) => r.searchText,
    nameOf: (r) => r.name,
    countOf: (r) => r.reps.length,
    locale,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder={nl ? "Zoek op naam, richting of vertegenwoordiger" : "Search by name, track or representative"}
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
              <SortHeader label={nl ? "POC" : "POC"} active={sort?.key === "name" ? sort.dir : null} onClick={() => toggleSort("name")} />
              <SortHeader
                label={nl ? "Vertegenwoordigers" : "Representatives"}
                active={sort?.key === "count" ? sort.dir : null}
                onClick={() => toggleSort("count")}
                align="right"
              />
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {filtered.map((poc) => (
              <PocRowView
                key={poc.id}
                poc={poc}
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
            <div><Label>Slug</Label><Input name="slug" required placeholder="computerwetenschappen" /></div>
            <div><Label>{nl ? "Studierichting" : "Study track"}</Label><Input name="studyTrack" required placeholder={nl ? "bv. Computer Science" : "e.g. Computer Science"} /></div>
            <div><Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label><Input name="nameNl" required /></div>
            <div><Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label><Input name="nameEn" /></div>
            <div className="md:col-span-2"><Label>{nl ? "Beschrijving (NL)" : "Description (NL)"}</Label><Textarea name="descriptionNl" rows={2} /></div>
            <div className="md:col-span-2"><Label>{nl ? "Beschrijving (EN)" : "Description (EN)"}</Label><Textarea name="descriptionEn" rows={2} /></div>
            <div className="md:col-span-2">
              <ProgrammesField options={programmeOptions} selected={[]} nl={nl} />
            </div>
            <div><Label>{nl ? "Volgorde" : "Order"}</Label><Input name="order" type="number" defaultValue={pocs.length} /></div>
          </SaveForm>
        </Modal>
      )}
    </div>
  );
}

function PocRowView({
  poc,
  isOpen,
  onToggle,
  nl,
  locale,
  saveLabels,
  programmeOptions,
}: {
  poc: PocRow;
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
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="cursor-pointer"
      >
        <td>
          <div className="flex items-start gap-2">
            <Chevron open={isOpen} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-vtk-ink">{poc.name}</span>
                <code className="rounded bg-vtk-blue-soft/60 px-1.5 py-0.5 text-[11px] text-[#5c667f]">{poc.slug}</code>
              </div>
              <div className="mt-0.5 text-xs text-[#5c667f]">{poc.studyTrack}</div>
            </div>
          </div>
        </td>
        <td className="text-right tabular-nums">{poc.reps.length}</td>
        <td className="text-right text-[#5c667f]">{isOpen ? (nl ? "Sluiten" : "Close") : nl ? "Details" : "Details"}</td>
      </tr>
      {isOpen && (
        <tr id={detailId}>
          <td colSpan={3} className="bg-vtk-blue-soft/20">
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
                          {r.role ? <span className="ml-1 text-xs font-normal text-[#5c667f]">· {r.role}</span> : null}
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
                  {r.role ? <span className="text-xs text-[#5c667f]">· {r.role}</span> : null}
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
            <div className="md:col-span-2"><Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label><Input name="nameNl" defaultValue={poc.nameNl} required /></div>
            <div className="md:col-span-2"><Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label><Input name="nameEn" defaultValue={poc.nameEn} /></div>
            <div className="md:col-span-2"><Label>{nl ? "Volgorde" : "Order"}</Label><Input name="order" type="number" defaultValue={poc.order} /></div>
            <div className="md:col-span-3"><Label>Slug</Label><Input name="slug" defaultValue={poc.slug} required /></div>
            <div className="md:col-span-3"><Label>{nl ? "Studierichting" : "Study track"}</Label><Input name="studyTrack" defaultValue={poc.studyTrack} required /></div>
            <div className="md:col-span-6"><Label>{nl ? "Beschrijving (NL)" : "Description (NL)"}</Label><Textarea name="descriptionNl" defaultValue={poc.descriptionNl} rows={2} /></div>
            <div className="md:col-span-6"><Label>{nl ? "Beschrijving (EN)" : "Description (EN)"}</Label><Textarea name="descriptionEn" defaultValue={poc.descriptionEn} rows={2} /></div>
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
