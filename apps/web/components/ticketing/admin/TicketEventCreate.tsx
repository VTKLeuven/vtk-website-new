"use client";

import Link from "next/link";
import { useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { ConfirmDialog } from "@vtk/ui";
import {
  applyTicketTemplate,
  formatMinutesBefore,
  templateTimeOfDay,
  type TicketEventTemplate,
} from "@/lib/ticketing/templates";
import { localDateTimeToUtc } from "@/lib/ticketing/time";
import { TicketEventForm, type LinkedCalendarEvent } from "./TicketEventForm";
import { SettingsPanel } from "./SettingsPanel";
import { ticketBase, type AdminLocale } from "./format";

/**
 * Het aanmaakscherm van een ticketevent: eerst een sjabloon (of niet), dan het
 * gewone formulier.
 *
 * Een cantus is elke keer dezelfde verkoopomgeving op een andere dag. Het
 * sjabloon vult die omgeving in; wat je hier kiest is enkel een **vertrekpunt**,
 * elk veld eronder blijft aanpasbaar. Het sjabloon levert het uur en de duur,
 * niet de dag: die vul je hier in, en daaruit volgen start, einde en het
 * verkoopvenster ("drie dagen vooraf").
 *
 * Van sjabloon of dag wisselen herbouwt het formulier eronder volledig (een
 * remount op `key`): half overschrijven levert een scherm op waar de titel van
 * het ene sjabloon onder de prijzen van het andere staat. Is er al iets
 * ingevuld, dan gaat er eerst een bevestiging over.
 */
export function TicketEventCreate({
  templates,
  initialTemplateSlug,
  today,
  groups,
  calendarEvents,
  linkedCalendarEvent,
  baseEvent,
  canManageTemplates,
  locale,
}: {
  templates: TicketEventTemplate[];
  initialTemplateSlug: string | null;
  /** Vandaag als "YYYY-MM-DD" in Brussel; het datumveld opent hierop. */
  today: string;
  groups: { id: string; nameNl: string; nameEn: string }[];
  calendarEvents: { id: string; titleNl: string; titleEn: string | null; start: Date }[];
  linkedCalendarEvent?: LinkedCalendarEvent | null;
  /** Wat het formulier zonder sjabloon al meekreeg (een gekoppeld kalenderevent). */
  baseEvent?: { ownerGroupId?: string; slug?: string };
  canManageTemplates: boolean;
  locale: AdminLocale;
}) {
  const nl = locale === "nl";
  const [slug, setSlug] = useState<string>(initialTemplateSlug ?? "");
  const [day, setDay] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<{ slug: string; day: string } | null>(null);

  const template = templates.find((candidate) => candidate.slug === slug) ?? null;

  /** Wisselen mag altijd; enkel wanneer er al werk in het formulier zit, eerst vragen. */
  function choose(nextSlug: string, nextDay: string) {
    if (dirty) {
      setPending({ slug: nextSlug, day: nextDay });
      return;
    }
    setSlug(nextSlug);
    setDay(nextDay);
  }

  function applyPending() {
    if (!pending) return;
    setSlug(pending.slug);
    setDay(pending.day);
    setPending(null);
    setDirty(false);
  }

  // De datums die het formulier voorgevuld krijgt. Zonder dag blijven ze leeg:
  // een sjabloon kent het uur, niet de datum.
  const schedule = (() => {
    if (!template || !day) return null;
    try {
      const startsAt = localDateTimeToUtc(`${day}T${templateTimeOfDay(template)}`);
      return applyTicketTemplate(template, startsAt);
    } catch {
      return null;
    }
  })();

  const prefill = template
    ? {
        ...baseEvent,
        ownerGroupId: baseEvent?.ownerGroupId ?? template.ownerGroupId ?? undefined,
        titleNl: template.titleNl,
        titleEn: template.titleEn,
        descriptionNl: template.descriptionNl,
        descriptionEn: template.descriptionEn,
        location: template.location,
        locationAddress: template.locationAddress,
        locationLatitude: template.locationLatitude,
        locationLongitude: template.locationLongitude,
        maxTicketsPerOrder: template.maxTicketsPerOrder,
        cardCheckIn: template.cardCheckIn,
        contactEmail: template.contactEmail,
        startsAt: schedule?.startsAt,
        endsAt: schedule?.endsAt,
        salesStartAt: schedule?.salesStartAt ?? undefined,
        salesEndAt: schedule?.salesEndAt ?? undefined,
      }
    : baseEvent;

  const base = ticketBase(locale);

  return (
    <>
      <SettingsPanel
        title={nl ? "Sjabloon" : "Template"}
        status={
          template
            ? `${template.label} · ${template.types.length} ${nl ? "tickets" : "tickets"}`
            : nl
              ? "Geen sjabloon"
              : "No template"
        }
        icon={<LayoutTemplate aria-hidden="true" size={17} />}
        defaultOpen
      >
        {templates.length === 0 ? (
          <p className="ticket-admin-help">
            {nl ? "Er staat nog geen sjabloon klaar. " : "There is no template yet. "}
            {canManageTemplates ? (
              <Link href={`${base}/admin/tickets/sjablonen`}>
                {nl ? "Maak er eerst een aan" : "Create one first"}
              </Link>
            ) : nl ? (
              "Vraag aan wie de sjablonen beheert om er een klaar te zetten."
            ) : (
              "Ask whoever manages the templates to set one up."
            )}
          </p>
        ) : (
          <>
            <p className="ticket-admin-help">
              {nl
                ? "Een sjabloon vult dit formulier in met de tickets, prijzen en instellingen van een terugkerend evenement. Alles blijft daarna aanpasbaar."
                : "A template fills in this form with the tickets, prices and settings of a recurring event. Everything stays editable afterwards."}
            </p>
            <div className="ticket-admin-form-grid">
              <div className="ticket-admin-field">
                <label htmlFor="ticket-template">{nl ? "Sjabloon" : "Template"}</label>
                <select
                  id="ticket-template"
                  value={slug}
                  onChange={(changed) => choose(changed.target.value, day)}
                >
                  <option value="">{nl ? "Geen sjabloon (leeg formulier)" : "No template (empty form)"}</option>
                  {templates.map((candidate) => (
                    <option key={candidate.slug} value={candidate.slug}>
                      {candidate.label}
                    </option>
                  ))}
                </select>
                {template?.note ? <span className="ticket-admin-help">{template.note}</span> : null}
              </div>
              {template ? (
                <div className="ticket-admin-field">
                  <label htmlFor="ticket-template-day">{nl ? "Datum van het event" : "Event date"}</label>
                  <input
                    id="ticket-template-day"
                    type="date"
                    min={today}
                    value={day}
                    onChange={(changed) => choose(slug, changed.target.value)}
                  />
                  <span className="ticket-admin-help">
                    {nl
                      ? `Start om ${templateTimeOfDay(template)}; verkoop opent ${formatMinutesBefore(template.salesOpensMinutesBefore, locale)} en sluit ${formatMinutesBefore(template.salesClosesMinutesBefore, locale)}. Hieronder allemaal nog aan te passen.`
                      : `Starts at ${templateTimeOfDay(template)}; sales open ${formatMinutesBefore(template.salesOpensMinutesBefore, locale)} and close ${formatMinutesBefore(template.salesClosesMinutesBefore, locale)}. All still editable below.`}
                  </span>
                </div>
              ) : null}
            </div>
            {canManageTemplates ? (
              <p className="ticket-admin-help">
                <Link href={`${base}/admin/tickets/sjablonen`}>
                  {nl ? "Sjablonen beheren" : "Manage templates"}
                </Link>
              </p>
            ) : null}
          </>
        )}
      </SettingsPanel>

      {/* Elke wijziging in het formulier telt als werk dat je niet stil mag
          kwijtspelen wanneer iemand daarna nog van sjabloon wisselt. */}
      <div onInput={() => setDirty(true)}>
        <TicketEventForm
          key={`${slug}:${day}`}
          groups={groups}
          calendarEvents={calendarEvents}
          linkedCalendarEvent={linkedCalendarEvent}
          template={template}
          event={prefill}
          locale={locale}
        />
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={nl ? "Formulier opnieuw invullen?" : "Refill the form?"}
        description={
          nl
            ? "Wat je hierboven al invulde, wordt vervangen door de gegevens van het sjabloon. Er is nog niets aangemaakt."
            : "What you already filled in will be replaced by the template's data. Nothing has been created yet."
        }
        confirmLabel={nl ? "Vervangen" : "Replace"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        onConfirm={applyPending}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
