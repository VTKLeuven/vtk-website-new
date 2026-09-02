"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/app/[locale]/admin/admin-table";
import { IconButton, RowActions } from "@/components/ui/IconButton";
import { InfoIcon } from "@/components/ui/icons";
import {
  CONTRACT_STATE_META,
  DEPOSIT_STATE_META,
  KEY_STATE_META,
  RENTAL_STATUS_META,
} from "@/lib/theokotVerhuur";
import type { RentalTemplate } from "@/lib/theokotVerhuurMail";
import { RentalCalendar } from "./RentalCalendar";
import { RentalInspector } from "./RentalInspector";
import type { RentalView } from "./types";

/**
 * De werkbank van de verhuur: de aanvragen of kalender over de volle breedte,
 * met de gekozen aanvraag in een modal. Dit volgt hetzelfde patroon als het
 * rekeningenbeheer: eerst de volledige werklijst kunnen scannen, daarna pas het
 * uitgebreide formulier ervoor leggen.
 *
 * De selectie zit in clientstate en niet in de URL, want de modal bevat een
 * half opgestelde mail; een herlaadbeurt bij elke klik zou die weggooien.
 */

export function RentalBoard({
  nl,
  mode,
  rentals,
  templates,
  senderLabel,
  signature,
  contractAvailable,
  canManage,
  emptyMessage,
}: {
  nl: boolean;
  mode: "queue" | "processed" | "calendar";
  rentals: RentalView[];
  templates: RentalTemplate[];
  senderLabel: string;
  signature: string;
  contractAvailable: Record<string, boolean>;
  canManage: boolean;
  emptyMessage: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lang = nl ? "nl" : "en";

  // Na een verwijdering of een verversing kan de selectie naar iets wijzen dat er
  // niet meer is. Dat hoeft niet opgeruimd te worden: `selected` is dan vanzelf
  // null en de modal blijft dicht. Een cuid komt nooit een
  // tweede keer voor, dus een oude id kan later niets anders aanwijzen.
  const selected = useMemo(
    () => rentals.find((rental) => rental.id === selectedId) ?? null,
    [rentals, selectedId],
  );

  return (
    <div className="w-full">
      {mode === "calendar" ? (
        <RentalCalendar
          nl={nl}
          rentals={rentals}
          selectedId={selectedId}
          onSelect={(rental) => setSelectedId(rental.id)}
        />
      ) : rentals.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-vtk-blue/20 bg-white/60 px-5 py-12 text-center text-sm text-[#5c667f]">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-vtk-blue/12 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/10 text-left text-xs font-semibold text-[#5c667f]">
                  <th scope="col" className="px-4 py-3">{nl ? "Datum" : "Date"}</th>
                  <th scope="col" className="px-4 py-3">{nl ? "Aanvrager" : "Requester"}</th>
                  <th scope="col" className="px-4 py-3">{nl ? "Activiteit" : "Activity"}</th>
                  <th scope="col" className="px-4 py-3">{nl ? "Waarborg" : "Deposit"}</th>
                  <th scope="col" className="px-4 py-3">Contract</th>
                  <th scope="col" className="px-4 py-3">{nl ? "Sleutel" : "Key"}</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">{nl ? "Acties" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vtk-blue/5">
                {rentals.map((rental) => {
                  const meta = RENTAL_STATUS_META[rental.status];
                  return (
                    <tr
                      key={rental.id}
                      className="group transition-colors hover:bg-vtk-blue-soft/30"
                    >
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[#34405e]">
                        <span className="font-medium text-vtk-ink">{rental.dayLabel}</span>
                        <span className="block text-xs text-[#5c667f]">{rental.timeLabel}</span>
                      </td>
                      <td className="max-w-56 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedId(rental.id)}
                          className="text-left font-semibold text-vtk-ink underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vtk-blue"
                        >
                          {rental.responsibleName}
                        </button>
                        <span className="block break-all text-xs text-[#5c667f]">{rental.email}</span>
                      </td>
                      <td className="max-w-80 px-4 py-3 text-[#34405e]">
                        <span className="font-medium text-vtk-ink">{rental.purpose}</span>
                        <span className="block text-xs text-[#5c667f]">
                          {rental.attendees === null
                            ? nl
                              ? "Aantal aanwezigen onbekend"
                              : "Number of attendees unknown"
                            : `${rental.attendees} ${nl ? "aanwezigen" : "attendees"}`}
                        </span>
                        {rental.clashes.length > 0 && (
                          <span className="mt-1 block text-xs font-medium text-amber-800">
                            {nl ? "Botst met een andere aanvraag" : "Clashes with another request"}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <FollowUpState
                          label={DEPOSIT_STATE_META[rental.deposit][lang]}
                          open={rental.deposit === "TRANSFER" || rental.deposit === "CASH"}
                          problem={rental.deposit === "PROBLEM"}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <FollowUpState
                          label={CONTRACT_STATE_META[rental.contract][lang]}
                          open={rental.contract === "PENDING"}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <FollowUpState
                          label={KEY_STATE_META[rental.keyStatus][lang]}
                          open={rental.keyStatus === "PENDING"}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="tv-badge" data-tone={meta.tone}>
                          {meta[lang]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <RowActions>
                          <IconButton
                            label={nl ? "Details openen" : "Open details"}
                            srLabel={`${nl ? "Details openen" : "Open details"}: ${rental.responsibleName}`}
                            onClick={() => setSelectedId(rental.id)}
                          >
                            <InfoIcon />
                          </IconButton>
                        </RowActions>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-vtk-blue/10 px-4 py-2.5 text-xs text-[#5c667f]">
            {rentals.length} {rentals.length === 1
              ? nl ? "aanvraag" : "request"
              : nl ? "aanvragen" : "requests"}
          </div>
        </div>
      )}

      {selected && (
        <Modal
          title={`${selected.responsibleName} · ${selected.dayLabel}`}
          size="lg"
          onClose={() => setSelectedId(null)}
        >
          <RentalInspector
            // Een andere aanvraag is een nieuwe detailweergave: door de sleutel begint
            // het opstelvak leeg in plaats van met de half getypte mail van de
            // vorige aanvraag erin.
            key={selected.id}
            nl={nl}
            rental={selected}
            templates={templates}
            senderLabel={senderLabel}
            signature={signature}
            contractAvailable={contractAvailable}
            canManage={canManage}
          />
        </Modal>
      )}
    </div>
  );
}

function FollowUpState({
  label,
  open,
  problem = false,
}: {
  label: string;
  open: boolean;
  problem?: boolean;
}) {
  const tone = problem
    ? "border-red-200 bg-red-50 text-red-700"
    : open
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-zinc-200 bg-zinc-50 text-zinc-600";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {problem ? "!" : open ? "⏱" : "✓"} {label}
    </span>
  );
}
