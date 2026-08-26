"use client";

import { useMemo, useState } from "react";
import { Button, Select } from "@vtk/ui";
import { SearchBar } from "@/app/[locale]/admin/admin-table";
import {
  LESBEZOEK_STATUSES,
  LESBEZOEK_STATUS_META,
  isOpenStatus,
  isProcessedStatus,
  OPEN_STATUSES,
  PROCESSED_STATUSES,
} from "@/lib/lesbezoeken";
import type { LesbezoekTemplates } from "@/lib/lesbezoekenMail";
import { LesbezoekCalendar } from "./LesbezoekCalendar";
import { LesbezoekFormModal } from "./LesbezoekFormModal";
import { LesbezoekInspector } from "./LesbezoekInspector";
import type { OrganisationView, VisitView } from "./types";

/**
 * De weergaven van dezelfde bezoeken:
 * - queue: "Aanvragen" met openstaande items die actie vereisen (standaard Nieuw & Bij de prof).
 * - processed: "Verwerkt" met reeds afgehandelde items (Goedgekeurd, Afgewezen, Ingetrokken).
 * - calendar: "Kalender" met chronologisch geplande bezoeken.
 */

function defaultStatusForMode(m: "queue" | "processed" | "calendar"): string {
  if (m === "queue") return "OPEN";
  if (m === "processed") return "PROCESSED";
  return "";
}

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
  mode: "queue" | "processed" | "calendar";
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

  const [prevMode, setPrevMode] = useState(mode);
  const [status, setStatus] = useState<string>(() => defaultStatusForMode(mode));

  if (prevMode !== mode) {
    setPrevMode(mode);
    setStatus(defaultStatusForMode(mode));
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return visits.filter((visit) => {
      if (organisation && visit.organisationId !== organisation) return false;

      if (status === "OPEN") {
        if (!isOpenStatus(visit.status)) return false;
      } else if (status === "PROCESSED") {
        if (!isProcessedStatus(visit.status)) return false;
      } else if (status && status !== "ALL") {
        if (visit.status !== status) return false;
      }

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
  }, [visits, query, organisation, status]);

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
        <div className="w-56">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label={nl ? "Status" : "Status"}
          >
            {mode === "queue" && (
              <>
                <option value="OPEN">
                  {nl ? "Openstaand (Nieuw & Bij de prof)" : "Open (New & With professor)"}
                </option>
                {OPEN_STATUSES.map((code) => (
                  <option key={code} value={code}>
                    {LESBEZOEK_STATUS_META[code][nl ? "nl" : "en"]}
                  </option>
                ))}
                <option value="ALL">{nl ? "Alle statussen" : "All statuses"}</option>
              </>
            )}
            {mode === "processed" && (
              <>
                <option value="PROCESSED">{nl ? "Alle verwerkt" : "All processed"}</option>
                {PROCESSED_STATUSES.map((code) => (
                  <option key={code} value={code}>
                    {LESBEZOEK_STATUS_META[code][nl ? "nl" : "en"]}
                  </option>
                ))}
                <option value="ALL">{nl ? "Alle statussen" : "All statuses"}</option>
              </>
            )}
            {mode === "calendar" && (
              <>
                <option value="">{nl ? "Alle statussen" : "All statuses"}</option>
                <option value="OPEN">{nl ? "Openstaand" : "Open"}</option>
                <option value="PROCESSED">{nl ? "Verwerkt" : "Processed"}</option>
                {LESBEZOEK_STATUSES.map((code) => (
                  <option key={code} value={code}>
                    {LESBEZOEK_STATUS_META[code][nl ? "nl" : "en"]}
                  </option>
                ))}
              </>
            )}
          </Select>
        </div>
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
            mode === "processed"
              ? nl
                ? "Geen verwerkte lesbezoeken gevonden."
                : "No processed classroom visits found."
              : nl
                ? "Geen openstaande lesbezoeken die actie vereisen."
                : "No open classroom visits requiring action."
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
