"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, Clock3, Download, Maximize2, Printer, QrCode, XCircle } from "lucide-react";
import type { PublicTicket } from "./types";
import { TicketQrModal } from "./TicketQrModal";

/**
 * De wallet-knoppen staan uit tot Apple/Google Wallet echt werkt: een knop die
 * niets oplevert, kost meer vertrouwen dan ze waard is. De routes en de links
 * in de bevestigingsmail blijven bestaan; zet dit op `true` zodra de passen
 * werken.
 */
const SHOW_WALLET_BUTTONS = false;

/**
 * Eén toegangsbewijs: de QR op een navy strook links, de gegevens rechts.
 * Zie `vtk-tickets.css` (.ticket-pass) en docs/design-decisions.md.
 */
export function TicketPass({
  ticket,
  locale,
  eventTitle,
  eventDate,
  eventLocation,
}: {
  ticket: PublicTicket;
  locale: "nl" | "en";
  eventTitle?: string;
  eventDate?: string | Date;
  eventLocation?: string | null;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);
  const valid = ticket.status === "VALID" || ticket.status === "ISSUED";
  const checkedIn = Boolean(ticket.checkedInAt) || ticket.status === "CHECKED_IN";
  const showQr = Boolean(ticket.credential) && (valid || checkedIn);
  const nl = locale === "nl";
  const shortCode = ticket.publicId.slice(-6).toUpperCase();
  const ticketDescriptor = `${ticket.attendeeName} (${shortCode})`;

  return (
    <>
      <article
        className={`ticket-pass${checkedIn ? " is-used" : ""}${!valid && !checkedIn ? " is-invalid" : ""}`}
      >
        <div className="ticket-pass-stub">
          {showQr ? (
            <button
              type="button"
              className="ticket-pass-qr-trigger"
              onClick={() => setModalOpen(true)}
              aria-label={
                nl
                  ? `QR-code vergroten voor ${ticketDescriptor}`
                  : `Enlarge QR code for ${ticketDescriptor}`
              }
              title={nl ? "Klik om te vergroten" : "Click to enlarge"}
            >
              <div className="ticket-pass-qr-box">
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
                />
                <span className="ticket-pass-qr-zoom-badge" aria-hidden="true">
                  <Maximize2 size={12} />
                </span>
              </div>
              <span>{shortCode}</span>
            </button>
          ) : (
            <>
              <QrCode size={40} aria-hidden="true" />
              <span>{shortCode}</span>
            </>
          )}
        </div>
      <div className="ticket-pass-body">
        <div className="ticket-pass-top">
          <div>
            <span className="ticket-pass-type">{ticket.typeName}</span>
            <h3>{ticket.attendeeName}</h3>
            <p>
              {nl ? "Ticketnummer" : "Ticket number"} {ticket.publicId}
            </p>
          </div>
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

        {ticket.pdfUrl && (valid || checkedIn) ? (
          <div className="ticket-pass-actions">
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
              <Download size={17} aria-hidden="true" />
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
                <Printer size={17} aria-hidden="true" />
                {nl ? "Printversie" : "Print version"}
              </a>
            ) : null}
            {SHOW_WALLET_BUTTONS && ticket.walletAppleUrl ? (
              <a className="ticket-secondary-button" href={ticket.walletAppleUrl}>
                Apple Wallet
              </a>
            ) : null}
            {SHOW_WALLET_BUTTONS && ticket.walletGoogleUrl ? (
              <a
                className="ticket-secondary-button"
                href={ticket.walletGoogleUrl}
                target="_blank"
                rel="noreferrer"
              >
                Google Wallet
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>

    {modalOpen && showQr ? (
      <TicketQrModal
        ticket={ticket}
        locale={locale}
        eventTitle={eventTitle}
        eventDate={eventDate}
        eventLocation={eventLocation}
        onClose={closeModal}
      />
    ) : null}
  </>
);
}
