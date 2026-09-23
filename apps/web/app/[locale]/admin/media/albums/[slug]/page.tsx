import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { Card, Input, Label } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import {
  getImmichGalleryAlbum,
  getManageableGalleryAlbum,
  immichWebUrl,
  type GalleryAlbum,
  type ManageableAlbum,
} from "@/lib/immich-gallery";
import {
  addAlbumTabAction,
  detachAlbumTabAction,
  renameAlbumTabAction,
  saveAlbumDetailsAction,
  setAlbumVisibilityAction,
} from "@/app/actions/media-albums";
import { albumErrorMessages } from "./messages";
import { AlbumPhotoManager } from "./AlbumPhotoManager";
import { DeleteAlbumDialog } from "./DeleteAlbumDialog";
import { DetachedPhotos } from "./DetachedPhotos";

/**
 * Eén fotoalbum beheren: titel, beschrijving, cover, tabs, zichtbaarheid en de
 * foto's zelf.
 *
 * De `slug` is die van de momentopname. Een album dat van de site gehaald is,
 * zit niet in die momentopname; daarvoor aanvaardt deze pagina ook het
 * Immich-album-id, en toont ze dan enkel wat zonder gedeelde link kan: titel,
 * beschrijving, terugzetten en verwijderen. De foto's van zo'n album hebben
 * geen publieke URL meer, dus die tonen we niet.
 */
export const dynamic = "force-dynamic";

export default async function AdminAlbum({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: localeParam, slug } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requireAnyPermission(["media.manage", "photos.manageAlbums"]);
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const album: GalleryAlbum | null = await getImmichGalleryAlbum(slug).catch(() => null);
  const row: ManageableAlbum | null = await getManageableGalleryAlbum(album?.id ?? slug).catch(() => null);
  if (!album && !row) notFound();

  const albumId = album?.id ?? row!.id;
  const title = album?.title ?? row!.title;
  const description = album?.description ?? row?.publicDescription ?? "";
  const visible = !(row?.hidden ?? false);
  const tabs = album?.subAlbums && album.subAlbums.length > 1 ? album.subAlbums : [];
  const errorMessages = albumErrorMessages(locale);
  const immichUrl = immichWebUrl();

  const detached = await prisma.galleryDetachedPhoto.findMany({
    where: {
      gallery: "MAIN",
      albumId: { in: tabs.length > 0 ? tabs.map((tab) => tab.id) : [albumId] },
    },
    orderBy: { detachedAt: "desc" },
  });

  // De tab van het hoofdalbum zelf. Staat die er niet, dan heet ze op de site
  // "Algemeen"; dat is precies de val waar dit scherm voor gemaakt is.
  const parentTabName = row?.tab ?? "";
  const parentTab = tabs.find((tab) => tab.id === albumId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`${base}/admin/media`} className="text-sm text-zinc-500 hover:underline">
          {nl ? "← Terug naar media" : "← Back to media"}
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{title}</h1>
        <p className="text-sm text-zinc-500">
          {visible ? (
            <>
              {nl ? "Staat op " : "Live at "}
              <Link href={`${base}/media/${album?.slug ?? slug}`} className="underline">
                /media/{album?.slug ?? slug}
              </Link>
            </>
          ) : nl ? (
            "Staat niet op de mediapagina."
          ) : (
            "Not on the media page."
          )}
          {immichUrl ? (
            <>
              {" · "}
              <a
                href={`${immichUrl}/albums/${albumId}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {nl ? "Open in Immich" : "Open in Immich"}
              </a>
            </>
          ) : null}
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">{nl ? "Album" : "Album"}</h2>
        <SaveForm
          action={saveAlbumDetailsAction}
          submitLabel={nl ? "Opslaan" : "Save"}
          savingLabel={nl ? "Opslaan…" : "Saving…"}
          savedMessage={nl ? "Album opgeslagen." : "Album saved."}
          errorMessages={errorMessages}
          fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
          resetOnSuccess={false}
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          <input type="hidden" name="albumId" value={albumId} />
          <div>
            <Label>{nl ? "Titel" : "Title"}</Label>
            <Input name="title" defaultValue={title} required maxLength={200} />
            <p className="mt-1 text-xs text-zinc-500">
              {nl
                ? "De titel bepaalt het adres van het album. Hernoem je het, dan werken bestaande links naar de oude /media/…-pagina niet meer."
                : "The title determines the album's address. Renaming it breaks existing links to the old /media/… page."}
            </p>
          </div>
          <div>
            <Label>{nl ? "Beschrijving" : "Description"}</Label>
            <Input name="description" defaultValue={description} maxLength={1000} />
          </div>
        </SaveForm>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-semibold">{nl ? "Zichtbaarheid" : "Visibility"}</h2>
        <p className="mb-3 text-sm text-zinc-500">
          {nl
            ? "Van de site halen laat het album in Immich staan; je vindt het terug onderaan /admin/media en kan het hier weer terugzetten."
            : "Taking it off the site keeps the album in Immich; you find it back at the bottom of /admin/media and can put it back here."}
        </p>
        <SaveForm
          action={setAlbumVisibilityAction}
          submitLabel={visible ? (nl ? "Van de site halen" : "Take off the site") : nl ? "Op de site zetten" : "Put on the site"}
          savingLabel={nl ? "Bezig…" : "Working…"}
          savedMessage={
            visible
              ? nl
                ? "Album van de site gehaald."
                : "Album taken off the site."
              : nl
                ? "Album staat weer op de site."
                : "Album is back on the site."
          }
          errorMessages={errorMessages}
          fallbackErrorMessage={nl ? "Niet gelukt." : "Failed."}
          resetOnSuccess={false}
        >
          <input type="hidden" name="albumId" value={albumId} />
          <input type="hidden" name="visible" value={visible ? "false" : "true"} />
        </SaveForm>
      </Card>

      {album ? (
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">{nl ? "Tabs" : "Tabs"}</h2>
          <p className="mb-3 text-sm text-zinc-500">
            {nl
              ? "Elke tab is een eigen album in Immich. Een album zonder tabs toont gewoon al zijn foto's."
              : "Every tab is its own album in Immich. An album without tabs simply shows all its photos."}
          </p>

          {tabs.length > 1 && parentTab && !parentTabName ? (
            <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {nl
                ? `De foto's van het album zelf staan nu onder de tab "Algemeen", omdat dit album nog geen tabnaam heeft. Vul ze hieronder in.`
                : `The album's own photos sit under the tab "Algemeen" because this album has no tab name yet. Fill it in below.`}
            </p>
          ) : null}

          <ul className="divide-y divide-zinc-200">
            {tabs.map((tab) => (
              <li key={tab.id} className="py-3">
                <SaveForm
                  action={renameAlbumTabAction}
                  submitLabel={nl ? "Naam opslaan" : "Save name"}
                  savingLabel={nl ? "Opslaan…" : "Saving…"}
                  savedMessage={nl ? "Tabnaam opgeslagen." : "Tab name saved."}
                  errorMessages={errorMessages}
                  fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
                  resetOnSuccess={false}
                  className="flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="albumId" value={tab.id} />
                  <div className="w-56">
                    <Label>
                      {tab.id === albumId
                        ? nl
                          ? "Tab van het album zelf"
                          : "The album's own tab"
                        : nl
                          ? "Tabnaam"
                          : "Tab name"}
                    </Label>
                    <Input
                      name="tabName"
                      defaultValue={tab.id === albumId ? parentTabName || tab.title : tab.title}
                      maxLength={50}
                    />
                  </div>
                  <span className="pb-2 text-xs text-zinc-500">
                    {tab.photoCount} {nl ? "foto's" : "photos"}
                  </span>
                  {tab.id !== albumId ? (
                    <span className="pb-1">
                      <DeleteIconButton
                        action={detachAlbumTabAction}
                        fields={{ albumId: tab.id }}
                        label={nl ? "Tab loskoppelen" : "Detach tab"}
                        srLabel={
                          nl ? `Tab loskoppelen: ${tab.title}` : `Detach tab: ${tab.title}`
                        }
                        title={nl ? `Tab "${tab.title}" loskoppelen?` : `Detach tab "${tab.title}"?`}
                        description={
                          nl
                            ? `De ${tab.photoCount} foto's blijven bestaan: deze tab wordt een eigen album op de mediapagina, met een eigen kaart en een eigen adres. Er wordt niets verwijderd.`
                            : `The ${tab.photoCount} photos stay: this tab becomes its own album on the media page, with its own card and address. Nothing is deleted.`
                        }
                        confirmLabel={nl ? "Loskoppelen" : "Detach"}
                        cancelLabel={nl ? "Annuleren" : "Cancel"}
                        successMessage={
                          nl ? "Tab losgekoppeld; het is nu een eigen album." : "Tab detached; it is its own album now."
                        }
                      />
                    </span>
                  ) : null}
                </SaveForm>
                <p className="mt-1 text-xs text-zinc-500">
                  {nl
                    ? "Hernoemen wijzigt het adres van de tab (?sub=…); bestaande links naar deze tab werken daarna niet meer."
                    : "Renaming changes the tab's address (?sub=…); existing links to this tab stop working."}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-zinc-200 pt-4">
            <SaveForm
              action={addAlbumTabAction}
              submitLabel={nl ? "Tab toevoegen" : "Add tab"}
              savingLabel={nl ? "Bezig…" : "Working…"}
              savedMessage={nl ? "Tab toegevoegd. Upload er hieronder foto's in." : "Tab added. Upload photos into it below."}
              errorMessages={errorMessages}
              fallbackErrorMessage={nl ? "Niet gelukt." : "Failed."}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="slug" value={album.slug} />
              <div className="w-56">
                <Label>{nl ? "Nieuwe tab" : "New tab"}</Label>
                <Input name="tabName" placeholder="Photobooth" maxLength={50} required />
              </div>
              {tabs.length === 0 ? (
                <div className="w-56">
                  <Label>{nl ? "Tabnaam voor de huidige foto's" : "Tab name for the current photos"}</Label>
                  <Input name="parentTabName" placeholder={nl ? "Zaal" : "Hall"} maxLength={50} />
                </div>
              ) : null}
            </SaveForm>
            {tabs.length === 0 ? (
              <p className="mt-1 text-xs text-zinc-500">
                {nl
                  ? "De foto's die er nu in staan worden de eerste tab. Laat je die naam leeg, dan heet ze \"Algemeen\"."
                  : "The photos already in there become the first tab. Leave that name empty and it is called \"Algemeen\"."}
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {album ? (
        <AlbumPhotoManager
          locale={locale}
          slug={album.slug}
          albumId={albumId}
          coverPhotoId={album.coverPhoto?.id ?? null}
          tabs={
            tabs.length > 0
              ? tabs.map((tab) => ({
                  id: tab.id,
                  title: tab.id === albumId && parentTabName ? parentTabName : tab.title,
                  photos: tab.photos.map((photo) => ({
                    id: photo.id,
                    title: photo.title,
                    thumbnailUrl: photo.thumbnailUrl,
                  })),
                }))
              : [
                  {
                    id: albumId,
                    title,
                    photos: album.photos.map((photo) => ({
                      id: photo.id,
                      title: photo.title,
                      thumbnailUrl: photo.thumbnailUrl,
                    })),
                  },
                ]
          }
        />
      ) : null}

      {detached.length > 0 ? (
        <DetachedPhotos
          locale={locale}
          photos={detached.map((photo) => ({
            assetId: photo.assetId,
            filename: photo.filename,
            tabName: photo.tabName,
            albumId: photo.albumId,
          }))}
          tabs={
            tabs.length > 0
              ? tabs.map((tab) => ({ id: tab.id, title: tab.title }))
              : [{ id: albumId, title }]
          }
        />
      ) : null}

      <Card className="p-5">
        <h2 className="mb-1 font-semibold">{nl ? "Album verwijderen" : "Delete album"}</h2>
        <p className="mb-3 text-sm text-zinc-500">
          {nl
            ? "Het album verdwijnt uit Immich, tabs inbegrepen. De foto's zelf blijven bestaan tenzij je ze mee naar de prullenmand stuurt."
            : "The album disappears from Immich, tabs included. The photos themselves stay unless you send them to the trash as well."}
        </p>
        <DeleteAlbumDialog
          locale={locale}
          slug={album?.slug ?? slug}
          title={title}
          photoCount={album?.photoCount ?? row?.photoCount ?? 0}
          tabNames={tabs.map((tab) => tab.title)}
          backHref={`${base}/admin/media`}
        />
      </Card>
    </div>
  );
}
