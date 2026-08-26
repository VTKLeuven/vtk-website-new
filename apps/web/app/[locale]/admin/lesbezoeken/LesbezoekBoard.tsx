"use client";

import { useMemo, useState } from "react";
import { Button, Select } from "@vtk/ui";
import { SearchBar } from "@/app/[locale]/admin/admin-table";
import {
  LESBEZOEK_STATUSES,
  LESBEZOEK_STATUS_META,
  isOpenStatus,
} from "@/lib/lesbezoeken";
import type { LesbezoekTemplates } from "@/lib/lesbezoekenMail";
import { LesbezoekCalendar } from "./LesbezoekCalendar";
import { LesbezoekFormModal } from "./LesbezoekFormModal";
import { LesbezoekInspector } from "./LesbezoekInspector";
import type { OrganisationView, VisitView } from "./types";

/**
 * De twee weergaven van dezelfde bezoeken: de werklijst (wat moet er nog
 * gebeuren) en de kalender (wanneer staat wat gepland). Ze delen de filters en
 * hetzelfde detailpaneel, zodat je vanuit beide kanten dezelfde handelingen doet.
 *
 * De werklijst is de standaard en de kalender niet, omgekeerd aan de app die dit
 * vervangt. Die had enkel een kalender, en daardoor was "welke aanvraag ligt hier
 * al een week te wachten?" precies de vraag die je er niet aan kon stellen.
 */

export function LesbezoekBoard({
  nl,
  mode,
  canManage,
  visits,
  organisations,
  templates,
  signature,
}: {
  nl: boolean;
  mode: "queue" | "approved" | "calendar";
  canManage: boolean;
  visits: VisitView[];
  organisations: OrganisationView[];
  templates: LesbezoekTemplates;
  signature: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<VisitView | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [organisation, setOrganisation] = useState("");
  // De werklijst begint bij wat nog openstaat; de goedgekeurd-tab toont enkel goedgekeurd;
  // de kalender toont standaard alles.
  const [status, setStatus] = useState<string>(
    mode === "approved" ? "APPROVED" : mode === "queue" ? "OPEN" : "",
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return visits.filter((visit) => {
      if (mode === "approved" && visit.status !== "APPROVED") return false;
      if (organisation && visit.organisationId !== organisation) return false;
      if (status === "OPEN" && !isOpenStatus(visit.status)) return false;
      if (status && status !== "OPEN" && visit.status !== status) return false;
      if (!needle) return true;
      return [
        visit.organisationName,
        visit.course,
        visit.audience,
        visit.subject,
        visit.teacherName ?? "",
        visit.teacherEmail,
        visit.requesterEmail ?? "",
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [visits, query, organisation, status, mode]);

  const selected = selectedId ? (visits.find((visit) => visit.id === selectedId) ?? null) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder={
              nl ? "Zoek op organisatie, vak, docent…" : "Search organisation, course, lecturer…"
            }
            ariaLabel={nl ? "Zoeken in de lesbezoeken" : "Search classroom visits"}
          />
        </div>
        <div className="w-48">
          <Select
            value={organisation}
            onChange={(event) => setOrganisation(event.target.value)}
            aria-label={nl ? "Organisatie" : "Organisation"}
          >
            <option value="">{nl ? "Alle organisaties" : "All organisations"}</option>
            {organisations.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </div>
        {mode !== "approved" && (
          <div className="w-48">
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label={nl ? "Status" : "Status"}
            >
              <option value="">{nl ? "Alle statussen" : "All statuses"}</option>
              <option value="OPEN">{nl ? "Openstaand" : "Open"}</option>
              {LESBEZOEK_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {LESBEZOEK_STATUS_META[value][nl ? "nl" : "en"]}
                </option>
              ))}
            </Select>
          </div>
        )}
        {canManage && (
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            {nl ? "Nieuw lesbezoek" : "New classroom visit"}
          </Button>
        )}
      </div>

      {mode === "calendar" ? (
        <LesbezoekCalendar
          nl={nl}
          visits={filtered}
          selectedId={selectedId}
          onSelect={(visit) => setSelectedId(visit.id)}
        />
      ) : (
        <Queue
          nl={nl}
          visits={filtered}
          selectedId={selectedId}
          onSelect={setSelectedId}
          emptyText={
            mode === "approved"
              ? nl
                ? "Geen goedgekeurde lesbezoeken gevonden."
                : "No approved classroom visits found."
              : undefined
          }
        />
      )}

      {selected && (
        <LesbezoekInspector
          nl={nl}
          visit={selected}
          canManage={canManage}
          templates={templates}
          signature={signature}
          onClose={() => setSelectedId(null)}
          onEdit={() => {
            setEditing(selected);
            setSelectedId(null);
          }}
        />
      )}

      {(creating || editing) && (
        <LesbezoekFormModal
          nl={nl}
          visit={editing}
          organisations={organisations}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** De werklijst: één regel per aanvraag, chronologisch. */
function Queue({
  nl,
  visits,
  selectedId,
  onSelect,
  emptyText,
}: {
  nl: boolean;
  visits: VisitView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyText?: string;
}) {
  if (visits.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-vtk-blue/20 p-6 text-center text-sm text-[#5c667f]">
        {emptyText ??
          (nl
            ? "Geen aanvragen die aan deze filters voldoen."
            : "No requests match these filters.")}
      </p>
    );
  }

  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="lb-queue">
      {visits.map((visit) => {
        const meta = LESBEZOEK_STATUS_META[visit.status];
        return (
          <button
            key={visit.id}
            type="button"
            className="lb-item"
            aria-current={visit.id === selectedId}
            style={{ ["--org" as string]: visit.organisationColour }}
            onClick={() => onSelect(visit.id)}
          >
            <span className="lb-item-rail" aria-hidden="true" />
            <span className="lb-item-body">
              <span className="lb-item-top">
                <span className="lb-item-title">{visit.organisationName}</span>
                <span className="lb-badge" data-tone={meta.tone}>
                  {meta[nl ? "nl" : "en"]}
                </span>
                {visit.clashes.length > 0 && (
                  <span className="lb-badge" data-tone="waiting">
                    {nl ? "Mogelijk dubbel" : "Possible duplicate"}
                  </span>
                )}
                {visit.peculiarities.length > 0 && (
                  <span className="lb-badge" data-tone="waiting">
                    {nl ? "Let op deze docent" : "Note on this lecturer"}
                  </span>
                )}
              </span>
              <span className="lb-item-meta">
                {/* De datum staat hier als tekst en niet in een aparte kolom: op een
                    telefoon is een tabel met zes kolommen onleesbaar. */}
                {dateFmt.format(new Date(`${visit.day}T12:00:00`))} · {visit.time} ·{" "}
                {visit.course} · {visit.audience}
              </span>
              <span className="lb-item-meta">
                {nl ? "Docent" : "Lecturer"}: {visit.teacherName ?? visit.teacherEmail}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
