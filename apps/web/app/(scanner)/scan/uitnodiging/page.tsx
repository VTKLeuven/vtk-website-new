import Link from "next/link";
import { prisma } from "@vtk/db";
import { Check, ScanLine, Smartphone, TimerOff } from "lucide-react";

import { requireSession } from "@/lib/session";
import { verifyScannerInviteToken } from "@/lib/ticketing/crypto";
import { grantScannerRole } from "@/lib/ticketing/scannerAccess";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "VTK Scanner",
};

/**
 * Waar een gescande uitnodigings-QR landt.
 *
 * Dit is bewust een pagina en geen API: iemand scant die code met de gewone
 * camera van zijn telefoon, en die opent een browser. Wie nog niet ingelogd is,
 * logt hier eerst in; dat account is meteen het account dat scanrechten krijgt.
 *
 * Wat je krijgt is de rol `SCANNER` op dit ene event, en niets anders. Geen
 * bestellingen, geen deelnemerslijst in het beheer, geen Tickets-tab in de admin.
 */
export default async function ScannerInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const target = `/scan/uitnodiging${code ? `?code=${encodeURIComponent(code)}` : ""}`;
  const session = await requireSession(`/inloggen?next=${encodeURIComponent(target)}`);

  const eventId = code ? verifyScannerInviteToken(code) : null;
  const event = eventId
    ? await prisma.ticketEvent.findUnique({
        where: { id: eventId },
        select: { id: true, titleNl: true, location: true },
      })
    : null;

  if (!event) return <ExpiredInvite />;

  let failure: "conflict" | "failed" | null = null;
  try {
    await grantScannerRole(event.id, session.user.id, session.user.id, "INVITE");
  } catch (error) {
    // Wie al een andere rol op dit event heeft, kon sowieso al scannen; dat is
    // geen fout om een blokpagina voor te tonen.
    failure = error instanceof Error && error.message === "GRANT_ROLE_CONFLICT" ? "conflict" : "failed";
  }

  if (failure === "failed") {
    return (
      <main className="scanner-invite">
        <TimerOff aria-hidden="true" size={34} />
        <h1>Toegang geven lukte niet</h1>
        <p>Probeer de code opnieuw te scannen, of vraag iemand om je met je naam toe te voegen.</p>
      </main>
    );
  }

  return (
    <main className="scanner-invite">
      <span className="scanner-invite-check" aria-hidden="true">
        <Check size={26} />
      </span>
      <span className="scanner-invite-eyebrow">VTK SCANNER</span>
      <h1>{event.titleNl}</h1>
      <p>
        {failure === "conflict"
          ? "Je had al toegang tot dit evenement."
          : "Je kan dit evenement nu scannen."}
        {event.location ? ` ${event.location}.` : ""}
      </p>

      <Link className="scanner-invite-primary" href={`/scan/${event.id}`}>
        <ScanLine size={18} aria-hidden="true" /> Scannen
      </Link>
      {/* Wie de app heeft, komt hiermee meteen in het juiste event; wie ze niet
          heeft, gebruikt gewoon de knop hierboven. Het event staat sowieso in de
          lijst van de app, want dat volgt uit de toekenning die net gemaakt is. */}
      <a className="scanner-invite-secondary" href={`vtk-scanner://scan/${event.id}`}>
        <Smartphone size={16} aria-hidden="true" /> Open in de VTK Scanner-app
      </a>
    </main>
  );
}

function ExpiredInvite() {
  return (
    <main className="scanner-invite">
      <TimerOff aria-hidden="true" size={34} />
      <h1>Deze code is verlopen</h1>
      <p>
        De QR aan de deur vernieuwt zichzelf om de paar tellen, zodat een screenshot niet
        doorgestuurd kan worden. Laat ze opnieuw tonen en scan de code die op dat moment op het
        scherm staat.
      </p>
    </main>
  );
}
