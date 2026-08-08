import Link from "next/link";
import { CalendarDays, MapPin, ScanLine, X } from "lucide-react";

import { InstallButton } from "@/components/ticketing/scanner/InstallButton";
import { listScannableTicketEvents } from "@/lib/ticketing/authorization";
import { requireSession } from "@/lib/session";

export const metadata = {
  title: "VTK Scanner",
};

/**
 * Keuzescherm van de scanner: hier landt het icoon op het beginscherm.
 *
 * De scanner zelf zit per event onder `/scan/<eventId>`, maar een geïnstalleerde
 * app moet naar iets wijzen dat blijft kloppen. Vandaar deze tussenstap: open de
 * app, kies de fuif van vanavond, scan.
 */
export default async function ScannerIndexPage() {
  await requireSession(`/inloggen?next=${encodeURIComponent("/scan")}`);
  const events = await listScannableTicketEvents();

  const dateFormat = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="scanner-app scanner-picker">
      <header className="scanner-header">
        <div className="scanner-event-title">
          <span>VTK Scanner</span>
          <h1>Kies een evenement</h1>
        </div>
        <Link href="/tickets" className="scanner-close" aria-label="Scanner sluiten" title="Scanner sluiten">
          <X aria-hidden="true" />
        </Link>
      </header>

      <InstallButton />

      {events.length === 0 ? (
        <div className="scanner-picker-empty">
          <ScanLine size={30} aria-hidden="true" />
          <strong>Geen evenement om te scannen</strong>
          <p>
            Je ziet hier de evenementen waarvoor je scanrechten hebt, van twaalf uur na
            afloop tot een maand vooruit. Vraag de organisator om je toegang te geven.
          </p>
        </div>
      ) : (
        <ul className="scanner-picker-list">
          {events.map((event) => (
            <li key={event.id}>
              <Link href={`/scan/${event.id}`}>
                <strong>{event.titleNl}</strong>
                <span>
                  <CalendarDays size={15} aria-hidden="true" />
                  {dateFormat.format(event.startsAt)}
                </span>
                {event.location ? (
                  <span>
                    <MapPin size={15} aria-hidden="true" />
                    {event.location}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
