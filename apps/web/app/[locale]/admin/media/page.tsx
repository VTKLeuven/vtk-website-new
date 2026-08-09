import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { Card, Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { getMediaContent } from "@/lib/media-content";
import {
  immichWebUrl,
  listImmichGalleryAlbums,
  type GalleryAlbumSummary,
} from "@/lib/immich-gallery";
import { deleteMagazineAction, savePromoVideosAction } from "@/app/actions/media";
import { MagazineUploadForm } from "./MagazineUploadForm";
import { ImmichAlbumUploader } from "./ImmichAlbumUploader";
import { MagazineStats, parsePeriod } from "./MagazineStats";

export default async function AdminMedia({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ stats?: string | string[] }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  // Deze pagina bundelt twee dingen die apart toegekend kunnen worden:
  // magazines en video's (media.manage) en de fotoalbums (photos.manageAlbums).
  const session = await requireAnyPermission(["media.manage", "photos.manageAlbums"]);
  const canManageMedia = hasPermission(session, "media.manage");
  const canManageAlbums = hasPermission(session, "photos.manageAlbums");
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const { stats: statsPeriod } = await searchParams;
  const { publications, videos } = await getMediaContent();

  let galleryAlbums: GalleryAlbumSummary[] = [];
  let galleryError = false;
  if (canManageAlbums) {
    try {
      const gallery = await listImmichGalleryAlbums();
      galleryAlbums = gallery.albums;
    } catch {
      galleryError = true;
    }
  }
  const immichUrl = immichWebUrl();

  const videoRows = [...videos, null, null, null];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{nl ? "Media" : "Media"}</h1>
      <p className="text-sm text-zinc-600">
        {nl
          ? "Beheer wat er op de publieke mediapagina staat: magazines, promovideo's en fotoalbums."
          : "Manage what appears on the public media page: magazines, promo videos, and photo albums."}
        {" "}
        <Link href={`${base}/media`} className="underline">
          {nl ? "Bekijk de mediapagina" : "View the media page"}
        </Link>
      </p>

      {canManageMedia && (
      <>
      {/* Bovenaan, want dit is waar de redactie voor komt kijken; uploaden doe je
          een paar keer per jaar, cijfers bekijk je vaker. */}
      <MagazineStats locale={locale} publications={publications} period={parsePeriod(statsPeriod)} />

      <Card className="p-5">
        <h2 className="font-semibold mb-1">{nl ? "Nieuwe magazine-editie" : "New magazine issue"}</h2>
        <p className="text-sm text-zinc-500 mb-3">
          {nl
            ? "Upload de PDF van een nieuwe editie van Het Bakske of Ir.Reëel. Die verschijnt meteen bovenaan de boekenplank."
            : "Upload the PDF of a new issue of Het Bakske or Ir.Reëel. It appears at the top of the shelf immediately."}
        </p>
        <MagazineUploadForm locale={locale} />
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">
          {nl ? "Gepubliceerde edities" : "Published issues"} ({publications.length})
        </h2>
        <ul className="divide-y divide-zinc-200">
          {publications.map((p) => (
            // `basis-48` op de titel: smal past er naast het label niets meer
            // bij, dus zakt het actieblok als geheel naar een tweede regel in
            // plaats van de titel tot vier woorden per regel te knijpen.
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold uppercase">
                {p.kind === "bakske" ? "Bakske" : "Ir.Reëel"}
              </span>
              <span className="min-w-0 flex-1 basis-48 text-sm">
                {nl ? p.titleNl : p.titleEn || p.titleNl} · {nl ? p.issueNl : p.issueEn || p.issueNl}
                {p.publishedAt ? <span className="text-zinc-500"> · {p.publishedAt}</span> : null}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-3">
                <a
                  href={`/api/media/publications/${encodeURIComponent(p.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline"
                >
                  PDF
                </a>
                <DeleteIconButton
                  action={deleteMagazineAction}
                  fields={{ id: p.id }}
                  label={nl ? "Verwijderen" : "Delete"}
                  srLabel={`${nl ? "Verwijderen" : "Delete"}: ${nl ? p.titleNl : p.titleEn || p.titleNl} ${nl ? p.issueNl : p.issueEn || p.issueNl}`}
                  title={nl ? "Editie verwijderen?" : "Delete issue?"}
                  description={
                    nl
                      ? `"${p.titleNl} ${p.issueNl}" verdwijnt van de mediapagina. De andere edities blijven staan.`
                      : `"${p.titleEn || p.titleNl} ${p.issueEn || p.issueNl}" disappears from the media page. The other issues remain.`
                  }
                  confirmLabel={nl ? "Verwijderen" : "Delete"}
                  cancelLabel={nl ? "Annuleren" : "Cancel"}
                  successMessage={nl ? "Editie verwijderd" : "Issue deleted"}
                />
              </div>
            </li>
          ))}
          {publications.length === 0 ? (
            <li className="py-2 text-sm text-zinc-500">
              {nl ? "Nog geen edities." : "No issues yet."}
            </li>
          ) : null}
        </ul>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-1">{nl ? "Promovideo's" : "Promo videos"}</h2>
        <p className="text-sm text-zinc-500 mb-3">
          {nl
            ? "YouTube- of Vimeo-links die in de videosectie van de mediapagina staan. Lege rijen worden genegeerd."
            : "YouTube or Vimeo links shown in the media page video section. Empty rows are ignored."}
        </p>
        <SaveForm
          action={savePromoVideosAction}
          className="space-y-3"
          submitLabel={nl ? "Video's opslaan" : "Save videos"}
          savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
          savedMessage={nl ? "Video's opgeslagen" : "Videos saved"}
          fallbackErrorMessage={nl ? "Opslaan van de video's mislukt." : "Saving the videos failed."}
        >
          {videoRows.map((video, i) => (
            <div key={video ? video.id : `new-${i}`} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input type="hidden" name={`id-${i}`} value={video?.id ?? ""} />
              <div className="md:col-span-2">
                <Label>URL</Label>
                <Input name={`url-${i}`} defaultValue={video?.url ?? ""} placeholder="https://www.youtube.com/watch?v=…" />
              </div>
              <div>
                <Label>{nl ? "Titel (NL)" : "Title (NL)"}</Label>
                <Input name={`titleNl-${i}`} defaultValue={video?.titleNl ?? ""} />
              </div>
              <div>
                <Label>{nl ? "Titel (EN)" : "Title (EN)"}</Label>
                <Input name={`titleEn-${i}`} defaultValue={video?.titleEn ?? ""} />
              </div>
            </div>
          ))}
        </SaveForm>
      </Card>
      </>
      )}

      {/* Fotoalbums: aanmaken en de lijst van wat er publiek staat horen bij
          elkaar, anders lijkt het op twee losse features. Dit is sinds de
          opruiming van /admin/albums de enige plek waar albums beheerd worden;
          Immich is de enige bron die de publieke mediapagina leest. */}
      {canManageAlbums && (
      <Card className="p-5">
        <h2 className="font-semibold mb-1">{nl ? "Fotoalbums" : "Photo albums"}</h2>
        <p className="text-sm text-zinc-500 mb-4">
          {nl
            ? "Maak een album aan en upload de foto's rechtstreeks vanaf hier. Het album krijgt automatisch de galerijmarkering en verschijnt op de mediapagina."
            : "Create an album and upload photos right here. The album automatically gets the gallery marker and appears on the media page."}
          {immichUrl ? (
            <>
              {" "}
              {nl ? "Liever de volledige Immich-interface (sorteren, covers, personen)?" : "Prefer the full Immich interface (sorting, covers, people)?"}{" "}
              <a href={immichUrl} target="_blank" rel="noreferrer" className="underline">
                {nl ? "Open Immich" : "Open Immich"}
              </a>
              {nl
                ? ": geef nieuwe albums daar de beschrijving “[gallery]” om ze op de site te tonen."
                : ": give new albums the description “[gallery]” there to show them on the site."}
            </>
          ) : null}
        </p>
        <ImmichAlbumUploader locale={locale} />

        <h3 className="mt-6 mb-2 text-sm font-semibold">
          {nl ? "Staat nu op de mediapagina" : "Currently on the media page"} ({galleryAlbums.length})
        </h3>
        {galleryError ? (
          <p className="text-sm text-red-600">
            {nl
              ? "Immich is momenteel niet bereikbaar; de albumlijst kan niet geladen worden."
              : "Immich is currently unreachable; the album list cannot be loaded."}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {galleryAlbums.map((album) => (
              <li key={album.slug} className="flex items-center gap-3 py-2 text-sm">
                <Link href={`${base}/media/${album.slug}`} className="flex-1 hover:underline">
                  {album.title}
                </Link>
                <span className="text-xs text-zinc-500">
                  {album.photoCount} {nl ? "foto's" : "photos"}
                </span>
              </li>
            ))}
            {galleryAlbums.length === 0 ? (
              <li className="py-2 text-sm text-zinc-500">
                {nl ? "Nog geen albums met galerijmarkering." : "No albums with the gallery marker yet."}
              </li>
            ) : null}
          </ul>
        )}
      </Card>
      )}
    </div>
  );
}
