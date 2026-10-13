import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { takedownReasonLabel } from "@vtk/gallery";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { TakedownRow } from "./TakedownRow";

/**
 * Wie gevraagd heeft om een foto uit de galerij van vtk.be te halen.
 *
 * De rij in de databank is de waarheid; de mail naar communicatie@vtk.be is
 * enkel een seintje. Staat er een verzoek zonder dat er een mail uitging, dan
 * wordt dat hier gemeld: anders wacht iemand op een antwoord dat niemand zag
 * aankomen.
 *
 * Alleen `media.manage`, en niet `photos.manageAlbums`: dit is de enige plek
 * waar een foto echt weggegooid wordt.
 */
export const dynamic = "force-dynamic";

function formatMoment(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function AdminTakedowns({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("media.manage");

  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const requests = await prisma.photoTakedownRequest.findMany({
    where: { gallery: "MAIN" },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { handledBy: { select: { name: true } } },
  });

  const open = requests.filter((request) => request.status === "NEW");
  const handled = requests.filter((request) => request.status !== "NEW");

  const labels = {
    delete: nl ? "Foto verwijderen" : "Delete photo",
    deleteTitle: nl ? "Deze foto verwijderen?" : "Delete this photo?",
    deleteDescription: nl
      ? "{photo} gaat naar de prullenmand en verdwijnt meteen uit het album {album}. De rest van het album blijft staan. 30 dagen lang kan je ze onder Foto's, Prullenmand, terugzetten."
      : "{photo} moves to the trash and disappears from the album {album} straight away. The rest of the album stays. For 30 days you can put it back under Photos, Trash.",
    photoDeleted: nl ? "De foto is uit de galerij gehaald." : "The photo has been taken out of the gallery.",
    confirm: nl ? "Verwijderen" : "Delete",
    cancel: nl ? "Annuleren" : "Cancel",
    keep: nl ? "Bewaren met reden" : "Keep, with a reason",
    keepNote: nl ? "Waarom blijft deze foto staan?" : "Why is this photo staying?",
    keepSubmit: nl ? "Verzoek afsluiten" : "Close request",
    reopen: nl ? "Verzoek heropenen" : "Reopen request",
    viewAlbum: nl ? "Album bekijken" : "View album",
    reporter: nl ? "Melder" : "Reported by",
    reason: nl ? "Reden" : "Reason",
    received: nl ? "Ontvangen" : "Received",
    handledOn: nl ? "Afgehandeld" : "Handled",
    by: nl ? "door" : "by",
    note: nl ? "Notitie" : "Note",
    notMailed: nl ? "Niet gemaild" : "Not emailed",
    notMailedTitle: nl
      ? "Er is geen meldingsmail vertrokken"
      : "No notification email was sent",
    deleted: nl ? "Verwijderd" : "Deleted",
    kept: nl ? "Bewaard" : "Kept",
    saving: nl ? "Bezig…" : "Saving…",
    saved: nl ? "Het verzoek is afgesloten." : "The request has been closed.",
    failed: nl ? "Dat lukte niet. Probeer opnieuw." : "That did not work. Please try again.",
    noteRequired: nl
      ? "Schrijf op waarom de foto blijft staan."
      : "Write down why the photo is staying.",
    requestMissing: nl
      ? "Dit verzoek bestaat niet meer; herlaad de pagina."
      : "This request no longer exists; reload the page.",
    immichUnreachable: nl
      ? "De fotobibliotheek is niet bereikbaar; de foto is niet verwijderd."
      : "The photo library is unreachable; the photo was not deleted.",
  };

  return (
    // In het paneel en de lege toestand van de huid van het mediabeheer
    // (vtk-ticket-admin.css), zoals de andere tabbladen; de rijen zelf houden
    // hun eigen opmaak uit vtk-immich-gallery.css.
    <section className="ticket-admin-section">
      <div className="ticket-admin-section-head">
        <div>
          <h2>{nl ? "Verwijderverzoeken" : "Takedown requests"}</h2>
          <p className="ticket-admin-help">
          {nl
            ? "Mensen die vroegen om een foto uit de galerij te halen. Verwijderen zet de foto in de prullenmand van Foto's: ze is meteen van de site weg en blijft daar 30 dagen terug te zetten."
            : "People who asked us to take a photo out of the gallery. Deleting moves the photo to the trash under Photos: it leaves the site straight away and can be put back there for 30 days."}
          </p>
        </div>
      </div>

      {open.length === 0 ? (
        <div className="ticket-admin-empty-state">
          <p className="ticket-admin-empty-title">{nl ? "Geen openstaande verzoeken" : "No open requests"}</p>
          <p className="ticket-admin-empty-copy">
            {nl
              ? "Er staat niets te behandelen. Nieuwe verzoeken komen hier binnen en gaan ook per mail naar communicatie@vtk.be."
              : "Nothing to handle. New requests arrive here and are also emailed to communicatie@vtk.be."}
          </p>
        </div>
      ) : (
        <section className="vtk-takedown-section">
          <h2>
            {nl ? "Te behandelen" : "To handle"} <span className="vtk-takedown-count">{open.length}</span>
          </h2>
          {open.map((request) => (
            <TakedownRow
              key={request.id}
              labels={labels}
              albumHref={`${base}/media/${encodeURIComponent(request.albumSlug)}`}
              request={{
                id: request.id,
                albumTitle: request.albumTitle,
                photoFilename: request.photoFilename,
                reporterName: request.reporterName,
                reporterEmail: request.reporterEmail,
                reasonLabel: takedownReasonLabel(request.reason),
                message: request.message,
                createdAt: formatMoment(request.createdAt, locale),
                mailDelivered: request.mailDelivered,
                status: request.status,
                handlingNote: null,
                handledBy: null,
                handledAt: null,
              }}
            />
          ))}
        </section>
      )}

      {handled.length > 0 ? (
        <section className="vtk-takedown-section">
          <h2>{nl ? "Afgehandeld" : "Handled"}</h2>
          {handled.map((request) => (
            <TakedownRow
              key={request.id}
              labels={labels}
              albumHref={`${base}/media/${encodeURIComponent(request.albumSlug)}`}
              request={{
                id: request.id,
                albumTitle: request.albumTitle,
                photoFilename: request.photoFilename,
                reporterName: request.reporterName,
                reporterEmail: request.reporterEmail,
                reasonLabel: takedownReasonLabel(request.reason),
                message: request.message,
                createdAt: formatMoment(request.createdAt, locale),
                mailDelivered: request.mailDelivered,
                status: request.status,
                handlingNote: request.handlingNote,
                handledBy: request.handledBy?.name ?? null,
                handledAt: request.handledAt ? formatMoment(request.handledAt, locale) : null,
              }}
            />
          ))}
        </section>
      ) : null}

      <p className="vtk-takedown-footnote">
        {nl
          ? "Verzoeken worden na een jaar geanonimiseerd: de afhandeling blijft bewaard, de gegevens van de melder niet."
          : "Requests are anonymised after a year: the handling is kept, the reporter's details are not."}
      </p>
    </section>
  );
}
