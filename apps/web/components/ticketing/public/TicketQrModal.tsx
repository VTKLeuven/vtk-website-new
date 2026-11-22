"use client";

import { useCallback, useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Clock3, Download, Printer, XCircle } from "lucide-react";
import type { PublicTicket } from "./types";
import { formatTicketDate, formatTicketMoment } from "./types";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.hasAttribute("hidden")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

function isOutsideDialog(clientX: number, clientY: number, dialog: HTMLDialogElement): boolean {
  const rect = dialog.getBoundingClientRect();
  return clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom;
}

/**
 * Detailvenster voor een vergrote QR-code van een ticket.
 * Volgt de vormgeving van het Kalenderblad: donkere navy kop met technisch
 * patroon, hangende gele datumpin, gele onderstreping onder de naam,
 * facts-rooster en actieknoppen onderaan.
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const suppressCloseCountRef = useRef(0);
  const pressedOutsideRef = useRef(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const nl = locale === "nl";
  const valid = ticket.status === "VALID" || ticket.status === "ISSUED";
  const checkedIn = Boolean(ticket.checkedInAt) || ticket.status === "CHECKED_IN";
  const shortCode = ticket.publicId.slice(-6).toUpperCase();
  const ticketDescriptor = `${ticket.attendeeName} (${shortCode})`;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onCloseRef.current();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    closingRef.current = false;
    const activeElement = document.activeElement;
    if (!openerRef.current && activeElement instanceof HTMLElement && !dialog.contains(activeElement)) {
      openerRef.current = activeElement;
    }

    if (!dialog.open) {
      dialog.showModal();
    }
    closeBtnRef.current?.focus({ preventScroll: true });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) {
        // React Strict Mode dubbelt mounts door cleanup + remount te draaien;
        // een programmatisch `dialog.close()` vuurt een asynchroon
        // `close`-event. Sla dat event over zodat remount niet meteen sluit.
        suppressCloseCountRef.current += 1;
        dialog.close();
      }
      const opener = openerRef.current;
      if (opener && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      requestClose();
      return;
    }
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = getFocusableElements(dialog);
    if (focusables.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !(active instanceof HTMLElement) || !dialog.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !(active instanceof HTMLElement) || !dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

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
    <dialog
      ref={dialogRef}
      className="ticket-dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      {...({ closedby: "any" } as Record<string, string>)}
      onKeyDown={handleKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={(event) => {
        if (suppressCloseCountRef.current > 0) {
          suppressCloseCountRef.current -= 1;
          return;
        }
        if (event.currentTarget.open) return;
        requestClose();
      }}
      onPointerDown={(event) => {
        if ("closedBy" in HTMLDialogElement.prototype) {
          pressedOutsideRef.current = false;
          return;
        }
        pressedOutsideRef.current =
          event.target === event.currentTarget &&
          isOutsideDialog(event.clientX, event.clientY, event.currentTarget);
      }}
      onPointerUp={(event) => {
        if ("closedBy" in HTMLDialogElement.prototype) return;
        const wasOutside = pressedOutsideRef.current;
        pressedOutsideRef.current = false;
        if (
          wasOutside &&
          event.target === event.currentTarget &&
          isOutsideDialog(event.clientX, event.clientY, event.currentTarget)
        ) {
          requestClose();
        }
      }}
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
          ref={closeBtnRef}
          type="button"
          className="ticket-dialog-close"
          onClick={requestClose}
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

        <h2 className="ticket-dialog-title" id={titleId}>
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
              alt={
                nl
                  ? `QR-code van ticket voor ${ticketDescriptor}`
                  : `Ticket QR code for ${ticketDescriptor}`
              }
              className="ticket-dialog-qr-img"
            />
            <span className="ticket-dialog-qr-code">{shortCode}</span>
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
              <dd>{shortCode}</dd>
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
            onClick={requestClose}
          >
            {nl ? "Sluiten" : "Close"}
          </button>
          {ticket.pdfUrl && (valid || checkedIn) ? (
            <>
              <a
                className="ticket-primary-button"
                href={ticket.pdfUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={
                  nl
                    ? `Download ticket voor ${ticketDescriptor}`
                    : `Download ticket for ${ticketDescriptor}`
                }
              >
                <Download size={16} aria-hidden="true" />
                {nl ? "Download ticket" : "Download ticket"}
              </a>
              {ticket.printPdfUrl ? (
                <a
                  className="ticket-secondary-button"
                  href={ticket.printPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={
                    nl
                      ? `Printversie in zwart-wit voor ${ticketDescriptor}`
                      : `Black-and-white print version for ${ticketDescriptor}`
                  }
                >
                  <Printer size={16} aria-hidden="true" />
                  {nl ? "Printversie" : "Print version"}
                </a>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </dialog>,
    document.body
  );
}
