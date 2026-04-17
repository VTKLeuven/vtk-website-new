import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Button, Card, Input, Label, Textarea } from "@vtk/ui";
import { publicUrl } from "@/lib/storage";
import { saveAlbumAction } from "@/app/actions/albums";

export default async function AdminAlbums({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("photos.manageAlbums");
  const base = locale === "nl" ? "" : "/en";

  const albums = await prisma.photoAlbum.findMany({
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
    include: { coverPhoto: true, _count: { select: { photos: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{locale === "nl" ? "Albums" : "Albums"}</h1>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">{locale === "nl" ? "Nieuw album" : "New album"}</h2>
        <form action={saveAlbumAction} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <div><Label>Slug</Label><Input name="slug" required /></div>
          <div><Label>Title (NL)</Label><Input name="titleNl" required /></div>
          <div><Label>Title (EN)</Label><Input name="titleEn" /></div>
          <div><Label>Event date</Label><Input name="eventDate" type="date" /></div>
          <div className="md:col-span-2"><Label>Description (NL)</Label><Textarea name="descriptionNl" rows={2} /></div>
          <div className="md:col-span-2"><Label>Description (EN)</Label><Textarea name="descriptionEn" rows={2} /></div>
          <div className="md:col-span-2 flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="published" />
              {locale === "nl" ? "Publiek zichtbaar" : "Published"}
            </label>
            <Button type="submit">{locale === "nl" ? "Album aanmaken" : "Create album"}</Button>
          </div>
        </form>
      </Card>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {albums.map((a) => (
          <li key={a.id}>
            <Link href={`${base}/admin/albums/${a.id}`}>
              <Card className="p-4 h-full hover:shadow-md transition">
                <div className="aspect-video overflow-hidden rounded bg-zinc-200">
                  {a.coverPhoto ? (
                    <img
                      src={publicUrl(a.coverPhoto.thumbnailKey || a.coverPhoto.storageKey) ?? ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <h3 className="mt-2 font-semibold">{a.titleNl}</h3>
                <p className="text-xs text-zinc-500">
                  {a._count.photos} {locale === "nl" ? "foto's" : "photos"}
                  {a.publishedAt ? " · published" : " · draft"}
                </p>
              </Card>
            </Link>
          </li>
        ))}
        {albums.length === 0 && (
          <li className="text-sm text-zinc-500">{locale === "nl" ? "Nog geen albums." : "No albums yet."}</li>
        )}
      </ul>
    </div>
  );
}
