"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import type { AdminLocale } from "./format";

/**
 * De QR van één deelnemer, getekend zodra zijn detailpaneel opengaat.
 *
 * Wachten op dat opengaan is geen optimalisatie maar de reden dat dit een
 * clientcomponent is: de deelnemerslijst zet tot driehonderd panelen in de HTML
 * en een dichtgeklapte `<details>` is `display: none`, waar een browser de
 * afbeelding gewoon in ophaalt. Elke QR is een sharp-render van 1200 pixels, dus
 * dat zijn driehonderd renders voor een lijst waarvan je er meestal één opent.
 *
 * Eenmaal getoond blijft de `<img>` staan: het paneel wordt niet ontkoppeld bij
 * het dichtklappen, dus opnieuw openen kost niets.
 */
export function AttendeeQr({
  src,
  code,
  locale,
}: {
  src: string;
  code: string;
  locale: AdminLocale;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const nl = locale === "nl";

  useEffect(() => {
    const details = anchorRef.current?.closest("details");
    if (!details) {
      setVisible(true);
      return;
    }
    if (details.open) {
      setVisible(true);
      return;
    }
    const onToggle = () => {
      if (details.open) setVisible(true);
    };
    details.addEventListener("toggle", onToggle);
    return () => details.removeEventListener("toggle", onToggle);
  }, []);

  return (
    <div className="ticket-admin-qr" ref={anchorRef}>
      <div className="ticket-admin-qr-frame">
        {visible ? (
          // Beveiligde route met dezelfde rasterrenderer als het echte ticket; de
          // credential zit in het beeld en niet in de URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={nl ? `QR-code van ticket ${code}` : `QR code of ticket ${code}`}
            className="ticket-admin-qr-img"
            width={220}
            height={220}
          />
        ) : (
          <span className="ticket-admin-qr-placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="ticket-admin-qr-side">
        <p className="ticket-admin-empty-copy">
          {nl
            ? "Dit is de code die de deelnemer bij zich heeft. Scan ze met de scanner om de deur te testen; een scan telt echt mee en checkt deze deelnemer in."
            : "This is the code the attendee carries. Scan it with the scanner to try the door; a scan counts for real and checks this attendee in."}
        </p>
        <span className="ticket-admin-code">{code}</span>
        <a className="ticket-admin-button" href={src} target="_blank" rel="noreferrer">
          <Maximize2 aria-hidden="true" size={15} />
          {nl ? "Groter tonen" : "Show larger"}
        </a>
      </div>
    </div>
  );
}
