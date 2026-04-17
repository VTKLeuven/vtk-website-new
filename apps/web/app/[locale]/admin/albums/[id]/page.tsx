import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Button, Card, Input, Label, Textarea } from "@vtk/ui";
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
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition rounded flex flex-col justify-end opacity-0 group-hover:opacity-100 p-1 gap-1 text-xs">
                  <form action={setAlbumCoverAction}>
                    <input type="hidden" name="albumId" value={album.id} />
                    <input type="hidden" name="photoId" value={p.id} />
                    <button className="w-full rounded bg-white/90 px-2 py-1 text-zinc-900" type="submit">
                      {album.coverPhotoId === p.id ? "★ cover" : (locale === "nl" ? "Maak cover" : "Set cover")}
                    </button>
                  </form>
                  <form action={deletePhotoAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="albumId" value={album.id} />
                    <button className="w-full rounded bg-red-600 px-2 py-1 text-white" type="submit">
                      {locale === "nl" ? "Verwijder" : "Delete"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <form action={deleteAlbumAction}>
        <input type="hidden" name="id" value={album.id} />
        <Button variant="danger" type="submit">
          {locale === "nl" ? "Album verwijderen" : "Delete album"}
        </Button>
      </form>
    </div>
  );
}
