"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Clock3, Download, QrCode, UserRound, XCircle } from "lucide-react";
import type { PublicTicket } from "./types";

export function TicketPass({ ticket, locale }: { ticket: PublicTicket; locale: "nl" | "en" }) {
  const valid = ticket.status === "VALID" || ticket.status === "ISSUED";
  const checkedIn = Boolean(ticket.checkedInAt) || ticket.status === "CHECKED_IN";
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!ticket.credential || (!valid && !checkedIn)) return;
    QRCode.toDataURL(ticket.credential, {
      width: 480,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0A0F1F", light: "#FFFFFF" },
    }).then((url) => {
      if (active) setQrDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [checkedIn, ticket.credential, valid]);

  return (
    <article className={`ticket-pass${checkedIn ? " is-used" : ""}${!valid && !checkedIn ? " is-invalid" : ""}`}>
      <div className="ticket-pass-stub">
        {qrDataUrl ? (
          // Generated locally from the signed, PII-free ticket credential.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt={locale === "nl" ? "QR-code van ticket" : "Ticket QR code"} />
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
        </div>
      </div>
    </article>
  );
}
