"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CalendarPlus } from "lucide-react";
import { ConfirmDialog } from "@vtk/ui";
import { linkTicketEventToCalendarAction } from "@/app/actions/tickets";
import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";
import { useToast } from "@/components/ui/toast";
import type { AdminLocale } from "./format";

/**
 * Een kalenderevent dat bij deze verkoop lijkt te horen, met wat koppelen eraan
 * verandert. Dat laatste rekent de pagina uit, want de client kent de
 * beschrijving van het kalenderevent niet.
 */
export type CalendarLinkOption = {
  id: string;
  title: string;
  start: Date;
  published: boolean;
  sameDay: boolean;
  similarTitle: boolean;
  dayDistance: number;
  /** Het event ligt na de start van de verkoop (enkel van belang zonder `sameDay`). */
  later: boolean;
  /** De verkoop heeft andere uren dan het event en houdt die. */
  keepsOwnTimes: boolean;
  /** De eigen titel, die als naam op de eventpagina blijft staan; null als ze gelijk is. */
  titleAsLabel: string | null;
  /** De verkoop heeft een eigen beschrijving die door die van het event vervangen wordt. */
  replacesDescription: boolean;
};

const T = {
  nl: {
    title: "Deze tickets hangen aan geen kalenderevent.",
    body: "Ze staan op /tickets, maar niet op de pagina van de activiteit in de kalender.",
    question: (count: number) =>
      count === 1 ? "Hoort dit bij dit evenement?" : "Hoort dit bij een van deze evenementen?",
    none: "Staat de activiteit op de kalender, kies ze dan bij Basisinformatie onder “Gekoppeld kalenderevent”.",
    noneLink: "Naar Basisinformatie",
    sameDay: "zelfde dag",
    similarTitle: "gelijkaardige titel",
    daysLater: (days: number) => (days === 1 ? "1 dag later" : `${days} dagen later`),
    daysEarlier: (days: number) => (days === 1 ? "1 dag vroeger" : `${days} dagen vroeger`),
    draft: "nog in concept",
    link: "Koppelen",
    linkLabel: (title: string) => `Koppelen aan ${title}`,
    confirmTitle: (title: string) => `Koppelen aan “${title}”?`,
    confirm: "Koppelen",
    cancel: "Annuleren",
    effectButton:
      "De eventpagina krijgt een knop naar deze tickets. De ticketpagina blijft op haar eigen adres.",
    effectDraftEvent:
      "Dat kalenderevent staat nog in concept: de knop verschijnt pas wanneer het gepubliceerd is.",
    effectFields: "Titel, beschrijving en locatie van de ticketpagina komen voortaan van het kalenderevent.",
    effectLabel: (label: string) => `“${label}” blijft staan als naam van deze tickets op de eventpagina.`,
    effectDescription: "De eigen beschrijving van deze verkoop vervalt.",
    effectTimes: "De tickets houden hun eigen uren.",
    effectLater: "Wil je de tickets in het paneel van de eventpagina zelf, zet dat daarna aan bij Basisinformatie.",
    linked: (title: string) => `Gekoppeld aan ${title}.`,
    errors: {
      ALREADY_LINKED: "Niet gekoppeld: deze verkoop hing intussen al aan een kalenderevent. Herlaad de pagina.",
      INVALID_CALENDAR_EVENT:
        "Niet gekoppeld: dat kalenderevent bestaat niet meer of hoort bij een andere post.",
      FORBIDDEN: "Je hebt geen rechten om dit event te wijzigen.",
    } as Record<string, string>,
    failed: "Koppelen is mislukt. Probeer het opnieuw.",
  },
  en: {
    title: "These tickets are not linked to a calendar event.",
    body: "They are listed on /tickets, but not on the activity's page in the calendar.",
    question: (count: number) =>
      count === 1 ? "Does this belong to this event?" : "Does this belong to one of these events?",
    none: "If the activity is in the calendar, choose it under Basic information, “Linked calendar event”.",
    noneLink: "Go to Basic information",
    sameDay: "same day",
    similarTitle: "similar title",
    daysLater: (days: number) => (days === 1 ? "1 day later" : `${days} days later`),
    daysEarlier: (days: number) => (days === 1 ? "1 day earlier" : `${days} days earlier`),
    draft: "still a draft",
    link: "Link",
    linkLabel: (title: string) => `Link to ${title}`,
    confirmTitle: (title: string) => `Link to “${title}”?`,
    confirm: "Link",
    cancel: "Cancel",
    effectButton:
      "The event page gets a button to these tickets. The ticket page keeps its own address.",
    effectDraftEvent:
      "That calendar event is still a draft: the button only appears once it is published.",
    effectFields: "The ticket page's title, description and location will come from the calendar event.",
    effectLabel: (label: string) => `“${label}” stays as the name of these tickets on the event page.`,
    effectDescription: "This sale's own description is replaced.",
    effectTimes: "The tickets keep their own times.",
    effectLater: "To show the tickets in the event page's panel itself, turn that on under Basic information afterwards.",
    linked: (title: string) => `Linked to ${title}.`,
    errors: {
      ALREADY_LINKED: "Not linked: this sale was linked to a calendar event in the meantime. Reload the page.",
      INVALID_CALENDAR_EVENT:
        "Not linked: that calendar event no longer exists or belongs to another group.",
      FORBIDDEN: "You do not have permission to change this event.",
    } as Record<string, string>,
    failed: "Linking failed. Please try again.",
  },
} as const;

function whenLabel(date: Date, locale: AdminLocale): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * De waarschuwing onder de publiceerbalk: deze verkoop hangt aan geen
 * kalenderevent, dus de eventpagina weet er niets van. Met de events die
 * erbij lijken te horen (`lib/ticketing/calendarSuggestion.ts`), elk met een
 * knop om meteen te koppelen.
 *
 * Een waarschuwing en geen blokkade: niet elke verkoop hoort bij een activiteit
 * in de kalender. Zie docs/design-decisions.md.
 */
export function TicketCalendarLinkHint({
  eventId,
  options,
  locale,
}: {
  eventId: string;
  options: CalendarLinkOption[];
  locale: AdminLocale;
}) {
  const t = T[locale];
  const showToast = useToast();
  const [confirming, setConfirming] = useState<CalendarLinkOption | null>(null);
  const [pending, startTransition] = useTransition();

  function link(option: CalendarLinkOption) {
    const form = new FormData();
    form.set("eventId", eventId);
    form.set("calendarEventId", option.id);
    form.set("locale", locale);
    startTransition(async () => {
      try {
        const result = await unsentGuard.run(() => linkTicketEventToCalendarAction(form));
        if (result === UNSENT) return;
        setConfirming(null);
        if (result.ok) {
          showToast({ message: t.linked(option.title), variant: "success" });
          return;
        }
        showToast({ message: t.errors[result.error] ?? t.failed, variant: "error", duration: 0 });
      } catch {
        setConfirming(null);
        showToast({ message: t.failed, variant: "error", duration: 0 });
      }
    });
  }

  function reason(option: CalendarLinkOption): string {
    const parts: string[] = [];
    if (option.sameDay) parts.push(t.sameDay);
    if (option.similarTitle) parts.push(t.similarTitle);
    if (!option.sameDay) {
      parts.push(option.later ? t.daysLater(option.dayDistance) : t.daysEarlier(option.dayDistance));
    }
    if (!option.published) parts.push(t.draft);
    return parts.join(", ");
  }

  // Geen `role="status"`: dit staat er bij het laden al en kondigt niets aan,
  // en een live region met knoppen erin leest een screenreader slecht voor.
  // Geen `<p>`: de admin kleurt elke alinea grijs (`vtk-admin.css`), en dan
  // verloor de waarschuwing haar amber.
  return (
    <>
      <div className="ticket-admin-alert ticket-admin-calendar-hint">
        <AlertTriangle aria-hidden="true" size={17} />
        <div className="ticket-admin-calendar-hint-body">
          <div>
            <strong>{t.title}</strong> {t.body}
          </div>
          {options.length > 0 ? (
            <>
              <div>{t.question(options.length)}</div>
              <ul className="ticket-admin-calendar-hint-list">
                {options.map((option) => (
                  <li key={option.id}>
                    <div>
                      <strong>{option.title}</strong>
                      <span>
                        {whenLabel(option.start, locale)} · {reason(option)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ticket-admin-button"
                      aria-label={t.linkLabel(option.title)}
                      disabled={pending}
                      onClick={() => setConfirming(option)}
                    >
                      <CalendarPlus aria-hidden="true" size={15} />
                      {t.link}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div>
              {t.none}{" "}
              <a className="ticket-admin-alert-link" href="#ticket-calendar-event">
                {t.noneLink}
              </a>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? t.confirmTitle(confirming.title) : ""}
        destructive={false}
        pending={pending}
        description={
          confirming ? (
            <ul className="ticket-admin-calendar-hint-effects">
              <li>{t.effectButton}</li>
              {confirming.published ? null : <li>{t.effectDraftEvent}</li>}
              <li>{t.effectFields}</li>
              {confirming.titleAsLabel ? <li>{t.effectLabel(confirming.titleAsLabel)}</li> : null}
              {confirming.replacesDescription ? <li>{t.effectDescription}</li> : null}
              {confirming.keepsOwnTimes ? <li>{t.effectTimes}</li> : null}
              <li>{t.effectLater}</li>
            </ul>
          ) : null
        }
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={() => (confirming ? link(confirming) : undefined)}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}
