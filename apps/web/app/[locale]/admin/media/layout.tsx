import "@/app/design/vtk-ticket-admin.css";
import "@/app/design/vtk-media-admin.css";

import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
import { MediaAdminNav } from "./MediaAdminNav";

/**
 * Het mediabeheer: één kop met de tabbladen van Tickets (`.ticket-admin-tabs`)
 * en daaronder het tabblad dat open staat.
 *
 * Dit was één lange pagina met statistieken, magazines, video's en 144
 * albumrijen onder elkaar; zie `docs/design-decisions.md`, "Mediabeheer". De
 * huid komt uit `vtk-ticket-admin.css`, net als bij de formulieren, met enkel
 * het eigene in `vtk-media-admin.css`.
 */
export default async function MediaAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  // Twee rechten die apart toegekend kunnen worden: de fotoalbums
  // (photos.manageAlbums) en de rest van de mediapagina (media.manage).
  const session = await requireAnyPermission(["media.manage", "photos.manageAlbums"]);
  const canManageMedia = hasPermission(session, "media.manage");
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const openTakedowns = canManageMedia
    ? await prisma.photoTakedownRequest.count({ where: { gallery: "MAIN", status: "NEW" } })
    : 0;

  return (
    <div className="ticket-admin media-admin">
      <div className="ticket-admin-event">
        <header className="ticket-admin-event-head">
          <div className="ticket-admin-event-title">
            <div>
              <h1>Media</h1>
              <p className="media-admin-lead">
                {nl
                  ? "Wat er op vtk.be/media staat: de fotoalbums, de magazines en de aftermovies."
                  : "What is on vtk.be/media: the photo albums, the magazines and the aftermovies."}
              </p>
            </div>
            <div className="ticket-admin-event-actions">
              <a
                className="ticket-admin-icon-button"
                href={`${base}/media`}
                target="_blank"
                rel="noreferrer"
                aria-label={nl ? "De mediapagina openen" : "Open the media page"}
                title={nl ? "De mediapagina openen" : "Open the media page"}
              >
                <ExternalLink aria-hidden="true" size={17} />
              </a>
            </div>
          </div>
          <MediaAdminNav locale={locale} canManageMedia={canManageMedia} openTakedowns={openTakedowns} />
        </header>
        {children}
      </div>
    </div>
  );
}
