import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { loadRentalDecision } from "@/app/actions/theokotVerhuur";
import { rentalSenderLabel } from "@/lib/theokotVerhuur-server";
import { DecisionPanel } from "./DecisionPanel";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-theokot-verhuur.css";

/**
 * Het scherm achter de knoppen in de meldingsmail van een verhuuraanvraag.
 *
 * De link draagt een eenmalig token en vraagt geen login: wie de melding krijgt,
 * moet kunnen antwoorden vanuit zijn mailbox, ook op een telefoon zonder
 * ingelogde sessie. Het token vervalt na dertig dagen en werkt één keer.
 *
 * Belangrijk: deze pagina **doet** niets. Ze leest het token, toont de aanvraag
 * en de mail die klaarstaat, en wacht op een echte klik. Een mailclient die
 * links vooruitlaadt zou anders een verhuur kunnen goedkeuren.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Params = Promise<{ locale: string; token: string }>;

export default async function RentalDecisionPage({ params }: { params: Params }) {
  const { locale: localeParam, token } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const preview = await loadRentalDecision(token);

  const title = nl ? "Verhuuraanvraag beoordelen" : "Review rental request";

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">{title}</h1>
          <p className="vtk-page-subtitle">
            {nl
              ? "Je opende deze pagina vanuit de meldingsmail. Er is nog niets gebeurd; hieronder kies je wat er moet gebeuren."
              : "You opened this page from the notification email. Nothing has happened yet; below you choose what should happen."}
          </p>
        </div>
      </header>

      <div className="vtk-page-shell">
        <section className="vtk-panel tv-panel">
          {preview.status === "ok" ? (
            <DecisionPanel
              nl={nl}
              token={token}
              preview={preview}
              senderLabel={rentalSenderLabel()}
              adminHref={`${base}/admin/theokot/verhuur`}
            />
          ) : (
            <div className="space-y-4">
              <p className="tv-notice" data-tone="no" role="status">
                <span>{invalidMessage(preview.reason, nl)}</span>
              </p>
              <p className="text-sm text-[#5c667f]">
                {nl
                  ? "Je kan de aanvraag altijd in het beheer bekijken en daar beslissen."
                  : "You can always open the request in the admin and decide there."}{" "}
                <a className="vtk-link" href={`${base}/admin/theokot/verhuur`}>
                  {nl ? "Naar het beheer" : "Go to the admin"}
                </a>
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function invalidMessage(reason: "unknown" | "expired" | "used", nl: boolean): string {
  if (reason === "used") {
    return nl
      ? "Er is met deze mail al beslist. Elke link werkt één keer, en zodra er beslist is, doet de andere knop uit dezelfde mail niets meer."
      : "A decision was already made from this email. Every link works once, and once a decision is made the other button from the same email stops working.";
  }
  if (reason === "expired") {
    return nl
      ? "Deze link is vervallen. Beslisknoppen in een mail werken dertig dagen; daarna beslis je in het beheer."
      : "This link has expired. Decision buttons in an email work for thirty days; after that you decide in the admin.";
  }
  return nl
    ? "Deze link hoort bij geen enkele aanvraag (meer). Misschien is de aanvraag verwijderd, of is de link onderweg afgebroken."
    : "This link does not belong to any request (any more). The request may have been deleted, or the link may have been broken in transit.";
}
