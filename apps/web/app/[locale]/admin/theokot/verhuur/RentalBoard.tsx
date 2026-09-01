"use client";

import { useMemo, useState } from "react";
import { Card } from "@vtk/ui";
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
 * De werkbank van de verhuur: links de aanvragen (of de kalender), rechts de
 * aanvraag die je bekeek.
 *
 * De selectie zit in clientstate en niet in de URL, want het paneel bevat een
 * half opgestelde mail; een herlaadbeurt bij elke klik zou die weggooien.
 */

const TONE_COLOUR: Record<string, string> = {
  waiting: "#B45309",
  ok: "#0E9F6E",
  no: "#BE123C",
  done: "#5C667F",
};

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
  // null en het paneel valt terug op de lege toestand. Een cuid komt nooit een
  // tweede keer voor, dus een oude id kan later niets anders aanwijzen.
  const selected = useMemo(
    () => rentals.find((rental) => rental.id === selectedId) ?? null,
    [rentals, selectedId],
  );

  // Zolang er niets geselecteerd is, krijgt de kalender de hele breedte. Een
  // weekraster in een halve kolom zijn zeven kolommen van een centimeter, en het
  // paneel ernaast toont dan enkel de zin "klik op een aanvraag". Bij de lijsten
  // blijft het paneel wel staan: daar is elke rij één regel tekst, en die over
  // twaalfhonderd pixels uitrekken leest slechter dan de hint ernaast.
  const fullWidth = mode === "calendar" && !selected;

  return (
    <div className="tv-board" data-single={fullWidth || undefined}>
      <div>
        {mode === "calendar" ? (
          <RentalCalendar
            nl={nl}
            rentals={rentals}
            selectedId={selectedId}
            onSelect={(rental) => setSelectedId(rental.id)}
          />
        ) : rentals.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-vtk-blue/20 bg-white/60 px-5 py-10 text-center text-sm text-[#5c667f]">
            {emptyMessage}
          </p>
        ) : (
          <div className="tv-queue">
            {rentals.map((rental) => {
              const meta = RENTAL_STATUS_META[rental.status];
              return (
                <button
                  key={rental.id}
                  type="button"
                  className="tv-item"
                  aria-current={rental.id === selectedId}
                  style={{ ["--tone" as string]: TONE_COLOUR[meta.tone] }}
                  onClick={() => setSelectedId(rental.id)}
                >
                  <span className="tv-item-rail" aria-hidden="true" />
                  <span className="tv-item-body">
                    <span className="tv-item-top">
                      <span className="tv-item-title">{rental.responsibleName}</span>
                      <span className="tv-badge" data-tone={meta.tone}>
                        {meta[lang]}
                      </span>
                    </span>
                    <span className="tv-item-meta">
                      {rental.dayLabel} · {rental.timeLabel} · {rental.purpose}
                    </span>
                    <span className="tv-flags">
                      <span
                        className="tv-flag"
                        data-open={rental.deposit === "TRANSFER" || rental.deposit === "CASH"}
                      >
                        {nl ? "Waarborg" : "Deposit"}: {DEPOSIT_STATE_META[rental.deposit][lang]}
                      </span>
                      <span className="tv-flag" data-open={rental.contract === "PENDING"}>
                        {nl ? "Contract" : "Contract"}: {CONTRACT_STATE_META[rental.contract][lang]}
                      </span>
                      <span className="tv-flag" data-open={rental.keyStatus === "PENDING"}>
                        {nl ? "Sleutel" : "Key"}: {KEY_STATE_META[rental.keyStatus][lang]}
                      </span>
                      {rental.clashes.length > 0 && (
                        <span className="tv-flag" data-open="true">
                          {nl ? "Botst met een andere aanvraag" : "Clashes with another request"}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!fullWidth && (
        <aside>
          {selected ? (
            <Card className="p-5">
              <RentalInspector
                // Een andere aanvraag is een ander paneel: door de sleutel begint
                // het opstelvak leeg in plaats van met de half getypte mail van
                // de vorige aanvraag erin.
                key={selected.id}
                nl={nl}
                rental={selected}
                templates={templates}
                senderLabel={senderLabel}
                signature={signature}
                contractAvailable={contractAvailable}
                canManage={canManage}
              />
            </Card>
          ) : (
            <div className="rounded-2xl border border-dashed border-vtk-blue/20 bg-white/60 px-5 py-10 text-center text-sm text-[#5c667f]">
              {nl
                ? "Klik op een aanvraag om ze te bekijken, op te volgen en te beantwoorden."
                : "Click a request to view it, follow it up and reply."}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
