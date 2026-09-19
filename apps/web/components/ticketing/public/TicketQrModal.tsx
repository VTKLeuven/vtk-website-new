"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Clock3, Download, XCircle } from "lucide-react";
import type { PublicTicket } from "./types";
import { formatTicketDate, formatTicketMoment } from "./types";

/**
 * Detailvenster voor een vergrote QR-code van een ticket.
 * Volgt exact de vormgeving en stijl van de ShiftDialog (Richting A / Kalenderblad):
 * donkere navy kop met technisch patroon, hangende gele datumpin,
 * gele onderstreping onder de naam, facts-rooster en actieknoppen onderaan.
 */
export function TicketQrModal({
  ticket,
  locale,
  eventTitle,
  eventDate,
  eventLocation,
  onClose,
}: {
  ticket: PublicTicket;
  locale: "nl" | "en";
  eventTitle?: string;
  eventDate?: string | Date;
  eventLocation?: string | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const nl = locale === "nl";
  const valid = ticket.status === "VALID" || ticket.status === "ISSUED";
  const checkedIn = Boolean(ticket.checkedInAt) || ticket.status === "CHECKED_IN";

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  let dowStr = "";
  let monthStr = "";
  let dayNum = "";
  if (eventDate) {
    const d = new Date(eventDate);
    dowStr = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-BE", {
      timeZone: "Europe/Brussels",
      weekday: "short",
    })
      .format(d)
      .replace(".", "");
    monthStr = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-BE", {
      timeZone: "Europe/Brussels",
      month: "short",
    })
      .format(d)
      .replace(".", "");
    dayNum = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Brussels",
      day: "numeric",
    }).format(d);
  }

  return createPortal(
    <div className="ticket-dialog-overlay" onClick={onClose}>
      <div
        className="ticket-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-dialog-title"
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ticket-dialog-top">
          {eventTitle ? (
            <span className="ticket-dialog-top-event">{eventTitle}</span>
          ) : null}
          <span className="ticket-dialog-top-when">
            {eventDate
              ? formatTicketMoment(eventDate, locale)
              : nl
                ? "Toegangsbewijs"
                : "Admission ticket"}
          </span>

          {eventDate ? (
            <span className="ticket-dialog-pin" aria-hidden="true">
              <i>{dowStr}</i>
              <b>{dayNum}</b>
              <i>{monthStr}</i>
            </span>
          ) : null}

          <button
            type="button"
            className="ticket-dialog-close"
            onClick={onClose}
            aria-label={nl ? "Sluiten" : "Close"}
            title={nl ? "Sluiten" : "Close"}
          >
            ✕
          </button>
        </div>

        <div className="ticket-dialog-body">
          <div className="ticket-dialog-tags">
            <span className="ticket-pass-type">{ticket.typeName}</span>
            {checkedIn ? (
              <span className="ticket-pass-state" data-tone="used">
                <CheckCircle2 size={15} aria-hidden="true" /> {nl ? "Ingecheckt" : "Checked in"}
              </span>
            ) : valid ? (
              <span className="ticket-pass-state" data-tone="valid">
                <CheckCircle2 size={15} aria-hidden="true" /> {nl ? "Geldig" : "Valid"}
              </span>
            ) : ticket.status === "PENDING" ? (
              <span className="ticket-pass-state" data-tone="pending">
                <Clock3 size={15} aria-hidden="true" /> {nl ? "Wordt aangemaakt" : "Being issued"}
              </span>
            ) : (
              <span className="ticket-pass-state" data-tone="invalid">
                <XCircle size={15} aria-hidden="true" /> {nl ? "Niet geldig" : "Not valid"}
              </span>
            )}
          </div>

          <h2 className="ticket-dialog-title" id="ticket-dialog-title">
            {ticket.attendeeName}
          </h2>

          <p className="ticket-dialog-lead">
            {nl ? "Ticketnummer" : "Ticket number"}{" "}
            <span className="ticket-dialog-code-inline">{ticket.publicId}</span>
          </p>

          <div className="ticket-dialog-qr-wrap">
            <div className="ticket-dialog-qr-frame">
              {/* Deze beveiligde route gebruikt dezelfde rasterrenderer als de
                  verkorte links. De ticketcredential komt zo niet in de afbeeldings-URL. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/tickets/${encodeURIComponent(ticket.id)}/qr`}
                alt={nl ? "QR-code van ticket" : "Ticket QR code"}
                className="ticket-dialog-qr-img"
              />
              <span className="ticket-dialog-qr-code">
                {ticket.publicId.slice(-6).toUpperCase()}
              </span>
            </div>
            <p className="ticket-dialog-qr-hint">
              {nl
                ? "Toon deze QR-code aan de inkom om te laten scannen."
                : "Present this QR code at the entrance to scan."}
            </p>
          </div>

          {eventLocation || eventDate ? (
            <dl className="ticket-dialog-facts">
              {eventLocation ? (
                <div>
                  <dt>{nl ? "Locatie" : "Location"}</dt>
                  <dd>{eventLocation}</dd>
                </div>
              ) : null}
              {eventDate ? (
                <div>
                  <dt>{nl ? "Datum & tijd" : "Date & time"}</dt>
                  <dd>{formatTicketDate(eventDate, locale)}</dd>
                </div>
              ) : null}
              <div>
                <dt>{nl ? "Type ticket" : "Ticket type"}</dt>
                <dd>{ticket.typeName}</dd>
              </div>
              <div>
                <dt>{nl ? "Code" : "Code"}</dt>
                <dd>{ticket.publicId.slice(-6).toUpperCase()}</dd>
              </div>
            </dl>
          ) : null}
        </div>

        <div className="ticket-dialog-foot">
          <span className="ticket-dialog-note">
            {nl
              ? "Tip: zet je schermhelderheid hoog voor vlot scannen."
              : "Tip: set your screen brightness high for smooth scanning."}
          </span>
          <div className="ticket-dialog-actions">
            <button
              type="button"
              className="ticket-secondary-button"
              onClick={onClose}
            >
              {nl ? "Sluiten" : "Close"}
            </button>
            {ticket.pdfUrl && (valid || checkedIn) ? (
              <a
                className="ticket-primary-button"
                href={ticket.pdfUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={16} aria-hidden="true" />
                {nl ? "Open ticket" : "Open ticket"}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
