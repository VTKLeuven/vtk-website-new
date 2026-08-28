"use client";

import { useMemo, useState } from "react";
import { Button, Select } from "@vtk/ui";
import { SearchBar } from "@/app/[locale]/admin/admin-table";
import {
  LESBEZOEK_STATUSES,
  LESBEZOEK_STATUS_META,
  isOpenStatus,
  isProcessedStatus,
  nudgeCountdownLabel,
  OPEN_STATUSES,
  PROCESSED_STATUSES,
} from "@/lib/lesbezoeken";
import {
  DEFAULT_LESBEZOEK_TEMPLATE_ITEMS,
  type LesbezoekTemplates,
} from "@/lib/lesbezoekenMail";
import { BulkMailModal, type BulkMode } from "./BulkMailModal";
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
  nudgeLeadDays,
}: {
  nl: boolean;
  mode: "queue" | "processed" | "calendar";
  canManage: boolean;
  visits: VisitView[];
  organisations: OrganisationView[];
  templates: LesbezoekTemplates;
  signature: string;
  /** Hoeveel dagen op voorhand de werklijst om een herinnering vraagt. */
  nudgeLeadDays: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<VisitView | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [organisation, setOrganisation] = useState("");
  // De aangevinkte aanvragen voor een merge. Bewust ids en geen objecten: na een
  // revalidatie zijn de VisitViews nieuwe objecten en zou een selectie op
  // identiteit stilletjes leeglopen.
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [bulkMode, setBulkMode] = useState<BulkMode | null>(null);

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
      } else if (status === "NUDGE") {
        if (!visit.needsNudge) return false;
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

  const templateItems =
    templates.items && templates.items.length > 0
      ? templates.items
      : DEFAULT_LESBEZOEK_TEMPLATE_ITEMS;

  // Enkel wat in beeld staat, telt mee: aanvinken en dan filteren mag de merge
  // niet vullen met bezoeken die je niet meer ziet.
  const checkedVisits = filtered.filter((visit) => checked.has(visit.id));
  const nudgeCount = visits.filter((visit) => visit.needsNudge).length;

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
                <option value="NUDGE">
                  {nl
                    ? `Herinnering nodig${nudgeCount > 0 ? ` (${nudgeCount})` : ""}`
                    : `Reminder due${nudgeCount > 0 ? ` (${nudgeCount})` : ""}`}
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

      {canManage && mode !== "calendar" && (
        <SelectionBar
          nl={nl}
          total={filtered.length}
          checkedVisits={checkedVisits}
          nudgeCount={nudgeCount}
          nudgeLeadDays={nudgeLeadDays}
          showNudgeHint={mode === "queue" && status !== "NUDGE"}
          onSelectAll={() => setChecked(new Set(filtered.map((visit) => visit.id)))}
          onClear={() => setChecked(new Set())}
          onBulk={setBulkMode}
          onShowNudges={() => setStatus("NUDGE")}
        />
      )}

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
          checked={canManage ? checked : null}
          onToggle={toggle}
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

      {bulkMode && (
        <BulkMailModal
          nl={nl}
          mode={bulkMode}
          visits={checkedVisits}
          templates={templateItems}
          signature={signature}
          onClose={() => setBulkMode(null)}
          onSent={() => setChecked(new Set())}
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

/**
 * De balk boven de werklijst: wat er aangevinkt staat en wat je ermee kan doen.
 *
 * Staat er niets aangevinkt, dan toont ze enkel de herinneringen die wachten.
 * Dat is de plek waar dat hoort: het is geen filter die je moet gaan zoeken maar
 * een mededeling over werk dat blijft liggen.
 */
function SelectionBar({
  nl,
  total,
  checkedVisits,
  nudgeCount,
  nudgeLeadDays,
  showNudgeHint,
  onSelectAll,
  onClear,
  onBulk,
  onShowNudges,
}: {
  nl: boolean;
  total: number;
  checkedVisits: VisitView[];
  nudgeCount: number;
  nudgeLeadDays: number;
  showNudgeHint: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onBulk: (mode: BulkMode) => void;
  onShowNudges: () => void;
}) {
  const count = checkedVisits.length;

  if (count === 0) {
    if (!showNudgeHint || nudgeCount === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-2.5 text-sm text-amber-900">
        <span>
          {nl
            ? `${nudgeCount} lesbezoek${nudgeCount === 1 ? "" : "en"} komt dichterbij (binnen ${nudgeLeadDays} dagen) terwijl de docent nog niet antwoordde. Tijd voor een herinnering.`
            : `${nudgeCount} class visit${nudgeCount === 1 ? " is" : "s are"} coming up (within ${nudgeLeadDays} days) while the lecturer has not replied. Time for a reminder.`}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onShowNudges}>
          {nl ? "Toon ze" : "Show them"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-vtk-ink/20 bg-vtk-blue-soft/50 px-4 py-2.5">
      <span className="text-sm font-semibold text-vtk-ink">
        {nl ? `${count} van ${total} aangevinkt` : `${count} of ${total} ticked`}
      </span>
      <Button type="button" size="sm" onClick={() => onBulk("professor")}>
        {nl ? "Naar de docenten…" : "Send to lecturers…"}
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={() => onBulk("requester")}>
        {nl ? "Terugkoppeling bundelen…" : "Bundle the replies…"}
      </Button>
      <div className="ml-auto flex items-center gap-2">
        {count < total && (
          <Button type="button" variant="ghost" size="sm" onClick={onSelectAll}>
            {nl ? "Alles in beeld" : "All in view"}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          {nl ? "Selectie wissen" : "Clear selection"}
        </Button>
      </div>
    </div>
  );
}

/** De werklijst: één regel per aanvraag, chronologisch. */
function Queue({
  nl,
  visits,
  selectedId,
  onSelect,
  checked,
  onToggle,
  emptyText,
}: {
  nl: boolean;
  visits: VisitView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** `null` wanneer je enkel mag kijken; dan is er niets aan te vinken. */
  checked: Set<string> | null;
  onToggle: (id: string) => void;
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
          <div
            key={visit.id}
            className="lb-item"
            data-select={checked ? "" : undefined}
            aria-current={visit.id === selectedId}
            style={{ ["--org" as string]: visit.organisationColour }}
          >
            <span className="lb-item-rail" aria-hidden="true" />
            {checked && (
              <label className="lb-item-check">
                <input
                  type="checkbox"
                  checked={checked.has(visit.id)}
                  onChange={() => onToggle(visit.id)}
                  aria-label={
                    nl
                      ? `Selecteren: ${visit.organisationName}, ${visit.course}`
                      : `Select: ${visit.organisationName}, ${visit.course}`
                  }
                />
              </label>
            )}
            <button type="button" className="lb-item-open" onClick={() => onSelect(visit.id)}>
              <span className="lb-item-body">
                <span className="lb-item-top">
                  <span className="lb-item-title">{visit.organisationName}</span>
                  <span className="lb-badge" data-tone={meta.tone}>
                    {meta[nl ? "nl" : "en"]}
                  </span>
                  {visit.scheduledMails && visit.scheduledMails.length > 0 && (
                    <span className="lb-badge flex items-center gap-1" data-tone="sent">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {nl ? `Mail gepland: ${visit.scheduledMails[0]!.sendAtShort}` : `Mail scheduled: ${visit.scheduledMails[0]!.sendAtShort}`}
                    </span>
                  )}
                  {visit.needsNudge && (
                    <span className="lb-badge" data-tone="waiting">
                      {nl
                        ? `Tijd voor een herinnering · ${nudgeCountdownLabel(visit.daysUntil, true)}`
                        : `Time for a reminder · ${nudgeCountdownLabel(visit.daysUntil, false)}`}
                    </span>
                  )}
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
          </div>
        );
      })}
    </div>
  );
}
