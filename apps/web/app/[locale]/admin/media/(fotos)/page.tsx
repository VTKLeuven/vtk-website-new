import { notFound } from "next/navigation";
import { hasPermission } from "@vtk/auth";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { fakbarUploadEnabled } from "@/lib/fakbar-gallery";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
import { FakbarUploadToggle } from "../FakbarUploadToggle";
import { EmptyLibrary } from "./EmptyLibrary";

export default async function PhotoLibraryHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const session = await requireAnyPermission(["media.manage", "photos.manageAlbums"]);
  const nl = locale === "nl";
  const canManageMedia = hasPermission(session, "media.manage");
  const fakbarEnabled = canManageMedia ? await fakbarUploadEnabled() : false;

  return (
    <>
      <EmptyLibrary locale={locale} />
      {/* Een instelling die je eens per jaar aanraakt: dicht, en enkel voor wie ze
          mag wijzigen. Ze stond bovenaan de albumsectie en duwde de uploader
          voor iedereen een scherm naar beneden. */}
      {canManageMedia ? (
        <AdminDisclosure
          summary={
            <span>
              {nl ? "Uploaden naar de fakbargalerij" : "Uploading to the fakbar gallery"}{" "}
              <span className="media-disclosure-state">
                {fakbarEnabled ? (nl ? "aan" : "on") : nl ? "uit" : "off"}
              </span>
            </span>
          }
        >
          <FakbarUploadToggle locale={locale} enabled={fakbarEnabled} />
        </AdminDisclosure>
      ) : null}
    </>
  );
}
