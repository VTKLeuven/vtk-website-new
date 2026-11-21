"use client";

import { useMemo, useState } from "react";
import { SaveForm } from "@/components/ui/SaveForm";
import { sendAttendeeMessageAction } from "@/app/actions/tickets";
import {
  ATTENDEE_GROUPS,
  attendeeGroupLabel,
  type AttendeeGroup,
} from "@/lib/ticketing/attendeeGroups";
import type { AdminLocale } from "./format";

/**
 * "Deelnemers mailen" op het tabblad Deelnemers: een onderwerp en een bericht
 * aan alle deelnemers met een geldig ticket, of aan die van een of meer
 * tickettypes en/of groepen. Het aantal adressen telt mee terwijl je kiest, en
 * de bevestiging noemt het nog eens: een mail aan tweehonderd mensen krijg je
 * niet terug.
 *
 * De kandidaten komen zonder adres mee (`key` is een volgnummer per adres), de
 * server rekent de ontvangers bij het versturen opnieuw uit.
 */
export function AttendeeMessageForm({
  locale,
  eventId,
  ticketTypes,
  candidates,
}: {
  locale: AdminLocale;
  eventId: string;
  ticketTypes: { id: string; name: string }[];
  candidates: { key: number; ticketTypeId: string; group: AttendeeGroup }[];
}) {
  const nl = locale === "nl";
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<Set<AttendeeGroup>>(new Set());
  const id = (name: string) => `attendee-message-${name}`;

  const count = useMemo(() => {
    const keys = new Set<number>();
    for (const candidate of candidates) {
      if (types.size > 0 && !types.has(candidate.ticketTypeId)) continue;
      if (groups.size > 0 && !groups.has(candidate.group)) continue;
      keys.add(candidate.key);
    }
    return keys.size;
  }, [candidates, types, groups]);

  const perType = useMemo(() => {
    const result = new Map<string, Set<number>>();
    for (const candidate of candidates) {
      const set = result.get(candidate.ticketTypeId) ?? new Set<number>();
      set.add(candidate.key);
      result.set(candidate.ticketTypeId, set);
    }
    return result;
  }, [candidates]);
  const perGroup = useMemo(() => {
    const result = new Map<AttendeeGroup, Set<number>>();
    for (const candidate of candidates) {
      const set = result.get(candidate.group) ?? new Set<number>();
      set.add(candidate.key);
      result.set(candidate.group, set);
    }
    return result;
  }, [candidates]);

  const toggle = <T,>(set: Set<T>, item: T, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(item);
    else next.delete(item);
    return next;
  };
  const addresses = (n: number) => (nl ? `${n} ${n === 1 ? "adres" : "adressen"}` : `${n} ${n === 1 ? "address" : "addresses"}`);
  const shownTypes = ticketTypes.filter((type) => perType.has(type.id));

  if (candidates.length === 0) {
    return (
      <p className="ticket-admin-help">
        {nl ? "Er zijn nog geen deelnemers met een geldig ticket om te mailen." : "There are no attendees with a valid ticket to email yet."}
      </p>
    );
  }

  return (
    <SaveForm
      action={sendAttendeeMessageAction}
      className="ticket-admin-form"
      submitLabel={nl ? `Versturen naar ${addresses(count)}` : `Send to ${addresses(count)}`}
      submitDisabled={count === 0}
      savingLabel={nl ? "Bezig..." : "Sending..."}
      savedMessage={
        nl
          ? `Bericht klaargezet voor ${addresses(count)}. Bij veel deelnemers duurt het enkele minuten voor iedereen het heeft.`
          : `Message queued for ${addresses(count)}. With many attendees it takes a few minutes for everyone to get it.`
      }
      confirmSubmit={{
        title: nl ? `Bericht naar ${addresses(count)} sturen?` : `Send the message to ${addresses(count)}?`,
        description: nl
          ? `Elke deelnemer met een geldig ticket die aan je keuze voldoet, krijgt deze mail, één keer per adres. Een verstuurde mail kan je niet terughalen.`
          : `Every attendee with a valid ticket who matches your choice gets this email, once per address. A sent email cannot be recalled.`,
        confirmLabel: nl ? "Versturen" : "Send",
        cancelLabel: nl ? "Annuleren" : "Cancel",
        destructive: false,
      }}
      errorMessages={{
        SUBJECT_REQUIRED: nl ? "Niet verstuurd: vul een onderwerp in." : "Not sent: enter a subject.",
        MESSAGE_REQUIRED: nl ? "Niet verstuurd: schrijf eerst een bericht." : "Not sent: write a message first.",
        NO_RECIPIENTS: nl
          ? "Niet verstuurd: geen enkele deelnemer met een geldig ticket voldoet aan deze keuze."
          : "Not sent: no attendee with a valid ticket matches this choice.",
      }}
      fallbackErrorMessage={nl ? "Het bericht is niet verstuurd." : "The message was not sent."}
      onSuccess={() => {
        setTypes(new Set());
        setGroups(new Set());
      }}
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="locale" value={locale} />
      <fieldset className="ticket-admin-field">
        <legend>{nl ? "Tickettypes" : "Ticket types"}</legend>
        <span className="ticket-admin-help">
          {nl ? "Niets aangevinkt: alle tickettypes." : "Nothing ticked: all ticket types."}
        </span>
        {shownTypes.map((type) => (
          <label key={type.id} className="ticket-admin-check">
            <input
              type="checkbox"
              name="ticketTypeId"
              value={type.id}
              checked={types.has(type.id)}
              onChange={(event) => setTypes(toggle(types, type.id, event.target.checked))}
            />
            <span>
              {type.name} <span className="ticket-admin-row-meta">({perType.get(type.id)?.size ?? 0})</span>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="ticket-admin-field">
        <legend>{nl ? "Groepen" : "Groups"}</legend>
        <span className="ticket-admin-help">
          {nl
            ? "Niets aangevinkt: iedereen. Samen met een tickettype geldt beide: bv. leden met een bierticket."
            : "Nothing ticked: everyone. Together with a ticket type both apply: e.g. members with a beer ticket."}
        </span>
        {ATTENDEE_GROUPS.filter((group) => perGroup.has(group)).map((group) => (
          <label key={group} className="ticket-admin-check">
            <input
              type="checkbox"
              name="group"
              value={group}
              checked={groups.has(group)}
              onChange={(event) => setGroups(toggle(groups, group, event.target.checked))}
            />
            <span>
              {attendeeGroupLabel(group, locale, true)}{" "}
              <span className="ticket-admin-row-meta">({perGroup.get(group)?.size ?? 0})</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="ticket-admin-field">
        <label htmlFor={id("subject")}>{nl ? "Onderwerp" : "Subject"}</label>
        <input id={id("subject")} name="subject" required maxLength={200} />
      </div>
      <div className="ticket-admin-field">
        <label htmlFor={id("message")}>{nl ? "Bericht" : "Message"}</label>
        <textarea id={id("message")} name="message" required rows={7} maxLength={5000} />
        <span className="ticket-admin-help">
          {nl
            ? "Komt letterlijk in de mail, onder de kop van het event. Antwoorden gaat naar het contactadres van het event."
            : "Goes into the email as written, under the event header. Replies go to the event's contact address."}
        </span>
      </div>
      <div className="ticket-admin-field">
        <label htmlFor={id("lang")}>{nl ? "Taal van de mail" : "Email language"}</label>
        <select id={id("lang")} name="mailLocale" defaultValue={locale}>
          <option value="nl">Nederlands</option>
          <option value="en">English</option>
        </select>
      </div>
    </SaveForm>
  );
}
