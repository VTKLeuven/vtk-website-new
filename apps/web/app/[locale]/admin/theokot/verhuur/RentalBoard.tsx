"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/app/[locale]/admin/admin-table";
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
  feedBaseUrl,
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
  feedBaseUrl?: string;
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
          feedBaseUrl={feedBaseUrl}
        />
      ) : rentals.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-vtk-blue/20 bg-white/60 px-5 py-12 text-center text-sm text-[#5c667f]">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-vtk-blue/12 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/10 text-left text-xs font-semibold text-[#5c667f]">
                  <th scope="col" className="py-2.5 pl-4 pr-3 whitespace-nowrap">{nl ? "Datum" : "Date"}</th>
                  <th scope="col" className="px-3 py-2.5">{nl ? "Aanvrager" : "Requester"}</th>
                  <th scope="col" className="px-3 py-2.5">{nl ? "Activiteit" : "Activity"}</th>
                  <th scope="col" className="px-3 py-2.5 whitespace-nowrap">{nl ? "Waarborg" : "Deposit"}</th>
                  <th scope="col" className="px-3 py-2.5 whitespace-nowrap">Contract</th>
                  <th scope="col" className="px-3 py-2.5 whitespace-nowrap">{nl ? "Sleutel" : "Key"}</th>
                  <th scope="col" className="py-2.5 pl-3 pr-4 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vtk-blue/5">
                {rentals.map((rental) => {
                  const meta = RENTAL_STATUS_META[rental.status];
                  return (
                    <tr
                      key={rental.id}
                      onClick={() => setSelectedId(rental.id)}
                      className="group cursor-pointer transition-colors hover:bg-vtk-blue-soft/30"
                    >
                      <td className="whitespace-nowrap py-2.5 pl-4 pr-3 tabular-nums text-[#34405e]">
                        <span className="font-medium text-vtk-ink">{rental.dayLabel}</span>
                        <span className="block text-xs text-[#5c667f]">{rental.timeLabel}</span>
                      </td>
                      <td className="min-w-0 max-w-[13rem] px-3 py-2.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(rental.id);
                          }}
                          className="block max-w-full truncate text-left font-semibold text-vtk-ink group-hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vtk-blue"
                        >
                          {rental.responsibleName}
                        </button>
                        <span className="block truncate text-xs text-[#5c667f]" title={rental.email}>
                          {rental.email}
                        </span>
                      </td>
                      <td className="min-w-0 max-w-[16rem] px-3 py-2.5 text-[#34405e]">
                        <span className="block truncate font-medium text-vtk-ink" title={rental.purpose}>
                          {rental.purpose}
                        </span>
                        <span className="block truncate text-xs text-[#5c667f]">
                          {rental.attendees === null
                            ? nl
                              ? "Aantal aanwezigen onbekend"
                              : "Number of attendees unknown"
                            : `${rental.attendees} ${nl ? "aanwezigen" : "attendees"}`}
                        </span>
                        {rental.clashes.length > 0 && (
                          <span className="mt-0.5 block truncate text-xs font-medium text-amber-800">
                            {nl ? "Botst met een andere aanvraag" : "Clashes with another request"}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <FollowUpState
                          label={DEPOSIT_STATE_META[rental.deposit][lang]}
                          open={rental.deposit === "TRANSFER" || rental.deposit === "CASH"}
                          problem={rental.deposit === "PROBLEM"}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <FollowUpState
                          label={CONTRACT_STATE_META[rental.contract][lang]}
                          open={rental.contract === "PENDING"}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <FollowUpState
                          label={KEY_STATE_META[rental.keyStatus][lang]}
                          open={rental.keyStatus === "PENDING"}
                        />
                      </td>
                      <td className="whitespace-nowrap py-2.5 pl-3 pr-4">
                        <span className="tv-badge" data-tone={meta.tone}>
                          {meta[lang]}
                        </span>
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
