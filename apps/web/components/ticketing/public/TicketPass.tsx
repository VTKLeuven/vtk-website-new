"use client";

import { CheckCircle2, Clock3, Download, QrCode, XCircle } from "lucide-react";
import type { PublicTicket } from "./types";

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
export function TicketPass({ ticket, locale }: { ticket: PublicTicket; locale: "nl" | "en" }) {
  const valid = ticket.status === "VALID" || ticket.status === "ISSUED";
  const checkedIn = Boolean(ticket.checkedInAt) || ticket.status === "CHECKED_IN";
  const showQr = Boolean(ticket.credential) && (valid || checkedIn);
  const nl = locale === "nl";

  return (
    <article
      className={`ticket-pass${checkedIn ? " is-used" : ""}${!valid && !checkedIn ? " is-invalid" : ""}`}
    >
      <div className="ticket-pass-stub">
        {showQr ? (
          // Deze beveiligde route gebruikt dezelfde rasterrenderer als de
          // verkorte links. De ticketcredential komt zo niet in de afbeeldings-URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/tickets/${encodeURIComponent(ticket.id)}/qr`}
            alt={nl ? "QR-code van ticket" : "Ticket QR code"}
          />
        ) : (
          <QrCode size={40} aria-hidden="true" />
        )}
        <span>{ticket.publicId.slice(-6).toUpperCase()}</span>
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
            >
              <Download size={17} aria-hidden="true" />
              {nl ? "Open ticket" : "Open ticket"}
            </a>
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
  );
}
