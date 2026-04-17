import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { publicUrl } from "@/lib/storage";

export default async function FotosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);
  const base = locale === "nl" ? "" : "/en";

  const albums = await prisma.photoAlbum.findMany({
    where: { publishedAt: { not: null } },
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
    include: { coverPhoto: true, _count: { select: { photos: true } } },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold mb-6">{dict.photos.title}</h1>
      {albums.length === 0 ? (
        <p className="text-zinc-500">{dict.photos.empty}</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {albums.map((a) => (
            <li key={a.id}>
              <Link href={`${base}/fotos/${a.slug}`} className="group block">
                <div className="aspect-square overflow-hidden rounded-lg bg-zinc-200">
                  {a.coverPhoto ? (
                    <img
                      src={publicUrl(a.coverPhoto.thumbnailKey || a.coverPhoto.storageKey) ?? ""}
                      alt={pick(a.titleNl, a.titleEn, locale)}
                      className="h-full w-full object-cover group-hover:scale-105 transition"
                    />
                  ) : null}
                </div>
                <h2 className="mt-2 font-medium">{pick(a.titleNl, a.titleEn, locale)}</h2>
                <p className="text-xs text-zinc-500">
                  {a._count.photos} {locale === "nl" ? "foto's" : "photos"}
                  {a.eventDate && ` · ${a.eventDate.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB")}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
