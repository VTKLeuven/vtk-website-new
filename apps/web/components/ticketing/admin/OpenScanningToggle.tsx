"use client";

import { useState } from "react";
import { SaveForm } from "@/components/ui/SaveForm";
import { setTicketOpenScanningAction } from "@/app/actions/tickets";
import type { AdminLocale } from "./format";

/**
 * De schakelaar voor de standaard scantoegang.
 *
 * Bewust met tekst erbij en niet enkel een schuifje: wat hier verandert is wie
 * er aan de deur van dit event kan staan, en dat wil je lezen voor je klikt.
 */
export function OpenScanningToggle({
  eventId,
  locale,
  openScanning,
}: {
  eventId: string;
  locale: AdminLocale;
  openScanning: boolean;
}) {
  const [open, setOpen] = useState(openScanning);
  const nl = locale === "nl";

  return (
    <SaveForm
      action={setTicketOpenScanningAction}
      className="ticket-admin-form"
      submitLabel={nl ? "Opslaan" : "Save"}
      savingLabel={nl ? "Opslaan" : "Saving"}
      savedMessage={nl ? "Scantoegang bijgewerkt" : "Scan access updated"}
      resetOnSuccess={false}
      submitDisabled={open === openScanning}
      fallbackErrorMessage={nl ? "Opslaan is niet gelukt" : "Saving failed"}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="openScanning" value={open ? "1" : "0"} />
      <div className="ticket-admin-field">
        <label htmlFor="open-scanning">{nl ? "Wie mag scannen" : "Who may scan"}</label>
        <select
          id="open-scanning"
          value={open ? "1" : "0"}
          onChange={(event) => setOpen(event.target.value === "1")}
        >
          <option value="1">
            {nl ? "Elke praesidiumpost" : "Every praesidium post"}
          </option>
          <option value="0">
            {nl ? "Enkel wie hieronder staat" : "Only those listed below"}
          </option>
        </select>
      </div>
      <p className="ticket-admin-hint">
        {open
          ? nl
            ? "Elke praesidiumpost kan dit event scannen, en bij een event van een werkgroep ook die werkgroep zelf. Wie kan scannen, ziet de namen van alle deelnemers: die lijst gaat mee naar het toestel om offline te kunnen werken."
            : "Every praesidium post can scan this event, and for a working group's event that working group too. Anyone who can scan sees every attendee's name: that list travels to the device so it works offline."
          : nl
            ? "Alleen wie hieronder een toekenning heeft, kan dit event scannen. Kies dit voor een gastenlijst die niet bij iedereen hoort te liggen."
            : "Only people granted access below can scan this event. Pick this for a guest list that should not be widely visible."}
      </p>
    </SaveForm>
  );
}
