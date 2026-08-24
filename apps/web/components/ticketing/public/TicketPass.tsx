"use client";

import { CheckCircle2, Clock3, Download, QrCode, UserRound, Wallet, XCircle } from "lucide-react";
import type { PublicTicket } from "./types";

export function TicketPass({ ticket, locale }: { ticket: PublicTicket; locale: "nl" | "en" }) {
  const valid = ticket.status === "VALID" || ticket.status === "ISSUED";
  const checkedIn = Boolean(ticket.checkedInAt) || ticket.status === "CHECKED_IN";
  const showQr = Boolean(ticket.credential) && (valid || checkedIn);

  return (
    <article className={`ticket-pass${checkedIn ? " is-used" : ""}${!valid && !checkedIn ? " is-invalid" : ""}`}>
      <div className="ticket-pass-stub">
        {showQr ? (
          // Deze beveiligde route gebruikt dezelfde rasterrenderer als de
          // verkorte links. De ticketcredential komt zo niet in de afbeeldings-URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/tickets/${encodeURIComponent(ticket.id)}/qr`} alt={locale === "nl" ? "QR-code van ticket" : "Ticket QR code"} />
        ) : (
          <QrCode size={28} aria-hidden="true" />
        )}
        <span>{ticket.publicId.slice(-6).toUpperCase()}</span>
      </div>
      <div className="ticket-pass-body">
        <div>
          <span className="ticket-pass-type">{ticket.typeName}</span>
          <h3><UserRound size={17} aria-hidden="true" /> {ticket.attendeeName}</h3>
          <p>{locale === "nl" ? "Ticketnummer" : "Ticket number"} · {ticket.publicId}</p>
        </div>
        <div className="ticket-pass-state">
          {checkedIn ? (
            <span className="ticket-state-used"><CheckCircle2 size={16} aria-hidden="true" /> {locale === "nl" ? "Ingecheckt" : "Checked in"}</span>
          ) : valid ? (
            <span className="ticket-state-valid"><CheckCircle2 size={16} aria-hidden="true" /> {locale === "nl" ? "Geldig" : "Valid"}</span>
          ) : ticket.status === "PENDING" ? (
            <span><Clock3 size={16} aria-hidden="true" /> {locale === "nl" ? "Wordt aangemaakt" : "Being issued"}</span>
          ) : (
            <span className="ticket-state-invalid"><XCircle size={16} aria-hidden="true" /> {locale === "nl" ? "Niet geldig" : "Not valid"}</span>
          )}
          {ticket.pdfUrl && (valid || checkedIn) ? (
            <a className="ticket-download-button" href={ticket.pdfUrl} target="_blank" rel="noreferrer">
              <Download size={17} aria-hidden="true" />
              {locale === "nl" ? "Open ticket" : "Open ticket"}
            </a>
          ) : null}
          {(ticket.walletAppleUrl || ticket.walletGoogleUrl) && (valid || checkedIn) ? (
            <div className="ticket-wallet-buttons">
              {ticket.walletAppleUrl ? (
                <a className="ticket-wallet-button" href={ticket.walletAppleUrl}>
                  <Wallet size={15} aria-hidden="true" />
                  {locale === "nl" ? "Apple Wallet" : "Apple Wallet"}
                </a>
              ) : null}
              {ticket.walletGoogleUrl ? (
                <a className="ticket-wallet-button" href={ticket.walletGoogleUrl} target="_blank" rel="noreferrer">
                  <Wallet size={15} aria-hidden="true" />
                  {locale === "nl" ? "Google Wallet" : "Google Wallet"}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
