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
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · Media</div>
          <h1 className="vtk-page-title">{dict.photos.title}</h1>
        </div>
        <div className="page-head-meta">
          <b>{albums.length}</b>
          <br />
          albums
        </div>
      </header>
      <div className="vtk-page-shell">
      {albums.length === 0 ? (
        <p className="text-[#5c667f]">{dict.photos.empty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {albums.map((a) => (
            <li key={a.id}>
              <Link href={`${base}/fotos/${a.slug}`} className="group block">
                <div className="aspect-square overflow-hidden rounded-[18px] border border-vtk-blue/10 bg-[#f2f0e9]">
                  {a.coverPhoto ? (
                    <img
                      src={publicUrl(a.coverPhoto.thumbnailKey || a.coverPhoto.storageKey) ?? ""}
                      alt={pick(a.titleNl, a.titleEn, locale)}
                      className="h-full w-full object-cover group-hover:scale-105 transition"
                    />
                  ) : null}
                </div>
                <h2 className="mt-3 font-semibold tracking-tight text-vtk-ink">{pick(a.titleNl, a.titleEn, locale)}</h2>
                <p className="text-xs text-[#5c667f]">
                  {a._count.photos} {locale === "nl" ? "foto's" : "photos"}
                  {a.eventDate && ` · ${a.eventDate.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB")}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}
