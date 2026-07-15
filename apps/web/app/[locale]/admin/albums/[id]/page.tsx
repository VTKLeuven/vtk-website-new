import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Button, Card, Input, Label, Textarea } from "@vtk/ui";
import { IconButton } from "@/components/ui/IconButton";
import { StarIcon } from "@/components/ui/icons";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { deleteAlbumAction, deletePhotoAction, saveAlbumAction, setAlbumCoverAction } from "@/app/actions/albums";
import { publicUrl } from "@/lib/storage";
import { PhotoUploader } from "./PhotoUploader";

export default async function AdminAlbumDetail({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("photos.manageAlbums");

  const album = await prisma.photoAlbum.findUnique({
    where: { id },
    include: { photos: { orderBy: { order: "asc" } } },
  });
  if (!album) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{album.titleNl}</h1>

      <Card className="p-5">
        <form action={saveAlbumAction} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input type="hidden" name="id" value={album.id} />
          <div><Label>Slug</Label><Input name="slug" defaultValue={album.slug} required /></div>
          <div><Label>Event date</Label><Input name="eventDate" type="date" defaultValue={album.eventDate?.toISOString().slice(0, 10) ?? ""} /></div>
          <div><Label>Title (NL)</Label><Input name="titleNl" defaultValue={album.titleNl} required /></div>
          <div><Label>Title (EN)</Label><Input name="titleEn" defaultValue={album.titleEn ?? ""} /></div>
          <div className="md:col-span-2"><Label>Description (NL)</Label><Textarea name="descriptionNl" defaultValue={album.descriptionNl ?? ""} rows={2} /></div>
          <div className="md:col-span-2"><Label>Description (EN)</Label><Textarea name="descriptionEn" defaultValue={album.descriptionEn ?? ""} rows={2} /></div>
          <div className="md:col-span-2 flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="published" defaultChecked={Boolean(album.publishedAt)} />
              {locale === "nl" ? "Publiek zichtbaar" : "Published"}
            </label>
            <Button type="submit">{locale === "nl" ? "Opslaan" : "Save"}</Button>
          </div>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">{locale === "nl" ? "Foto's uploaden" : "Upload photos"}</h2>
        <PhotoUploader albumId={album.id} locale={locale} />
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">
          {locale === "nl" ? "Foto's" : "Photos"} ({album.photos.length})
        </h2>
        {album.photos.length === 0 ? (
          <p className="text-sm text-zinc-500">—</p>
        ) : (
          <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {album.photos.map((p) => (
              <li key={p.id} className="relative group">
                <img
                  src={publicUrl(p.thumbnailKey || p.storageKey) ?? ""}
                  alt=""
                  className="aspect-square w-full object-cover rounded"
                />
                <div className="absolute inset-0 flex items-start justify-end gap-1 rounded bg-black/0 p-1 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100 focus-within:opacity-100">
                  <form action={setAlbumCoverAction}>
                    <input type="hidden" name="albumId" value={album.id} />
                    <input type="hidden" name="photoId" value={p.id} />
                    <IconButton
                      type="submit"
                      label={
                        album.coverPhotoId === p.id
                          ? locale === "nl"
                            ? "Dit is de cover"
                            : "This is the cover"
                          : locale === "nl"
                            ? "Maak cover"
                            : "Set cover"
                      }
                      className={
                        album.coverPhotoId === p.id
                          ? "bg-vtk-yellow text-vtk-ink"
                          : "bg-white/90 text-vtk-ink"
                      }
                    >
                      <StarIcon />
                    </IconButton>
                  </form>
                  <DeleteIconButton
                    action={deletePhotoAction}
                    fields={{ id: p.id, albumId: album.id }}
                    label={locale === "nl" ? "Foto verwijderen" : "Delete photo"}
                    title={locale === "nl" ? "Foto verwijderen?" : "Delete photo?"}
                    description={
                      locale === "nl"
                        ? "Deze foto wordt permanent uit het album en uit de opslag verwijderd. Dit kan niet ongedaan gemaakt worden."
                        : "This photo will be permanently removed from the album and from storage. This cannot be undone."
                    }
                    confirmLabel={locale === "nl" ? "Verwijderen" : "Delete"}
                    cancelLabel={locale === "nl" ? "Annuleren" : "Cancel"}
                    successMessage={locale === "nl" ? "Foto verwijderd" : "Photo deleted"}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <DeleteButton
        action={deleteAlbumAction}
        fields={{ id: album.id }}
        title={locale === "nl" ? "Album verwijderen?" : "Delete album?"}
        description={
          locale === "nl"
            ? `"${album.titleNl}" wordt permanent verwijderd, samen met alle ${album.photos.length} foto's erin. Dit kan niet ongedaan gemaakt worden.`
            : `"${album.titleNl}" will be permanently deleted, along with all ${album.photos.length} photos in it. This cannot be undone.`
        }
        confirmLabel={locale === "nl" ? "Verwijderen" : "Delete"}
        cancelLabel={locale === "nl" ? "Annuleren" : "Cancel"}
        // Geen toast: deze action redirect naar de albumlijst, want deze pagina
        // bestaat nadien niet meer.
      >
        {locale === "nl" ? "Album verwijderen" : "Delete album"}
      </DeleteButton>
    </div>
  );
}
