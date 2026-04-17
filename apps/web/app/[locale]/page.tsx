import Link from "next/link";
import { prisma } from "@vtk/db";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { notFound } from "next/navigation";
import { publicUrl } from "@/lib/storage";
import { Card } from "@vtk/ui";

type OpeningHoursSetting = {
  titleNl: string;
  titleEn: string;
  entries: Array<{ dayNl: string; dayEn: string; hours: string }>;
};

type CareerSetting = {
  titleNl: string;
  titleEn: string;
  bodyNl: string;
  bodyEn: string;
  ctaLabelNl?: string;
  ctaLabelEn?: string;
  ctaUrl?: string;
};

type AftermoviesSetting = {
  titleNl: string;
  titleEn: string;
  items: Array<{ type: "video" | "image"; url: string; titleNl?: string; titleEn?: string }>;
};

type FeaturedAlbumsSetting = { albumSlugs: string[] };

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);
  const base = locale === "nl" ? "" : "/en";

  const now = new Date();
  const [settings, upcomingEvents, featuredAlbums] = await Promise.all([
    prisma.setting.findMany({
      where: {
        key: {
          in: [
            "home.openingHours.cursusdienst",
            "home.openingHours.theokot",
            "home.career",
            "home.aftermovies",
            "home.featuredAlbums",
          ],
        },
      },
    }),
    prisma.calendarEvent.findMany({
      where: { start: { gte: now }, visibility: "PUBLIC" },
      orderBy: { start: "asc" },
      take: 4,
      include: { group: true },
    }),
    (async () => {
      const raw = await prisma.setting.findUnique({ where: { key: "home.featuredAlbums" } });
      const value = (raw?.value as FeaturedAlbumsSetting | null) ?? { albumSlugs: [] };
      if (value.albumSlugs.length === 0) return [];
      return prisma.photoAlbum.findMany({
        where: { slug: { in: value.albumSlugs }, publishedAt: { not: null } },
        include: { coverPhoto: true },
      });
    })(),
  ]);

  const settingsMap = new Map(settings.map((s) => [s.key, s.value as unknown]));
  const cursus = settingsMap.get("home.openingHours.cursusdienst") as OpeningHoursSetting | undefined;
  const theokot = settingsMap.get("home.openingHours.theokot") as OpeningHoursSetting | undefined;
  const career = settingsMap.get("home.career") as CareerSetting | undefined;
  const after = settingsMap.get("home.aftermovies") as AftermoviesSetting | undefined;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 md:py-14 space-y-16 md:space-y-20">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[2rem] border border-vtk-blue/10 bg-white p-8 sm:p-12 md:p-14 shadow-[0_24px_80px_-20px_rgba(26,31,74,0.12)]">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-vtk-yellow/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-vtk-blue/8 blur-3xl"
          aria-hidden
        />
        <div className="relative z-10 grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-vtk-blue/50">
              {locale === "nl" ? "Welkom" : "Welcome"}
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-vtk-blue sm:text-5xl md:text-[3.25rem] md:leading-[1.1]">
              {dict.home.welcome}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">
              {locale === "nl"
                ? "De studentenvereniging voor industrieel ingenieurs en ingenieurswetenschappers."
                : "The student association for industrial engineers and engineering scientists."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`${base}/kalender`}
                className="inline-flex items-center justify-center rounded-full bg-vtk-yellow px-6 py-3 text-sm font-bold text-vtk-blue shadow-md transition hover:bg-vtk-yellow-dark"
              >
                {dict.home.viewCalendar}
              </Link>
              <Link
                href={`${base}/aanbod`}
                className="inline-flex items-center justify-center rounded-full border-2 border-vtk-blue bg-white px-6 py-3 text-sm font-semibold text-vtk-blue transition hover:bg-vtk-blue hover:text-white"
              >
                {dict.home.readMore}
              </Link>
            </div>
          </div>
          <div className="relative rounded-2xl border border-vtk-blue/10 bg-gradient-to-br from-vtk-blue-soft via-white to-vtk-blue-muted p-6 sm:p-8">
            <div className="absolute left-6 top-0 h-1 w-12 rounded-full bg-vtk-yellow" aria-hidden />
            <p className="mt-4 text-sm font-medium text-vtk-blue/80">
              {locale === "nl"
                ? "Activiteiten, cursusdienst, career-events en meer — alles op één plek."
                : "Activities, course service, career events and more — all in one place."}
            </p>
            <ul className="mt-6 space-y-3 text-sm text-zinc-600">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-vtk-yellow" />
                {locale === "nl" ? "Kalender en groepenfilter" : "Calendar with group filters"}
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-vtk-yellow" />
                {locale === "nl" ? "Foto-albums en documenten" : "Photo albums and documents"}
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-vtk-yellow" />
                {locale === "nl" ? "Praesidium & vertegenwoordigers" : "Board & representatives"}
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Opening hours */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {[cursus, theokot].map((oh, idx) =>
          oh ? (
            <Card key={idx} className="p-6 sm:p-8">
              <div className="mb-4 flex items-center gap-3">
                <span className="h-10 w-1 rounded-full bg-vtk-yellow" aria-hidden />
                <h2 className="text-xl font-bold text-vtk-blue">
                  {pick(oh.titleNl, oh.titleEn, locale)}
                </h2>
              </div>
              <ul className="divide-y divide-zinc-100">
                {oh.entries.map((e, i) => (
                  <li key={i} className="flex justify-between gap-4 py-3 text-sm first:pt-0">
                    <span className="font-medium text-zinc-800">
                      {pick(e.dayNl, e.dayEn, locale)}
                    </span>
                    <span className="text-zinc-500 tabular-nums">{e.hours}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null
        )}
      </section>

      {/* Events */}
      <section>
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-vtk-blue md:text-3xl">
              {dict.home.upcomingEvents}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {locale === "nl" ? "Wat er binnenkort op de planning staat." : "What is coming up next."}
            </p>
          </div>
          <Link
            href={`${base}/kalender`}
            className="text-sm font-semibold text-vtk-blue underline decoration-vtk-yellow/80 underline-offset-4 hover:text-vtk-blue-light"
          >
            {dict.home.viewCalendar} →
          </Link>
        </div>
        {upcomingEvents.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-zinc-500">{dict.home.noUpcomingEvents}</p>
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {upcomingEvents.map((e) => (
              <li key={e.id}>
                <Card className="flex h-full flex-col p-5 transition hover:border-vtk-blue/20 hover:shadow-[0_12px_40px_-12px_rgba(26,31,74,0.15)]">
                  <time className="text-[11px] font-bold uppercase tracking-wider text-vtk-blue/70">
                    {e.start.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                    {" · "}
                    {e.start.toLocaleTimeString(locale === "nl" ? "nl-BE" : "en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <h3 className="mt-3 font-semibold leading-snug text-vtk-blue">
                    {pick(e.titleNl, e.titleEn, locale)}
                  </h3>
                  <p className="mt-2 text-xs text-zinc-500">
                    {pick(e.group.nameNl, e.group.nameEn, locale)}
                    {e.location ? ` · ${e.location}` : ""}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Career */}
      {career && (
        <section className="relative overflow-hidden rounded-[2rem] border border-vtk-blue/12 bg-white p-8 sm:p-10 md:p-12 shadow-[0_20px_60px_-24px_rgba(26,31,74,0.15)]">
          <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 translate-x-1/3 -translate-y-1/3 rounded-full bg-vtk-yellow/20 blur-2xl" aria-hidden />
          <div className="relative flex flex-col gap-8 md:flex-row md:items-start">
            <div className="hidden w-2 shrink-0 self-stretch rounded-full bg-gradient-to-b from-vtk-yellow to-vtk-yellow-dark md:block" aria-hidden />
            <div className="flex-1">
              <h2 className="text-2xl font-bold tracking-tight text-vtk-blue md:text-3xl">
                {pick(career.titleNl, career.titleEn, locale)}
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-600">
                {pick(career.bodyNl, career.bodyEn, locale)}
              </p>
              {career.ctaUrl && (
                <a
                  href={career.ctaUrl}
                  className="mt-8 inline-flex items-center justify-center rounded-full bg-vtk-yellow px-6 py-3 text-sm font-bold text-vtk-blue shadow-sm transition hover:bg-vtk-yellow-dark"
                >
                  {pick(career.ctaLabelNl || "Meer info", career.ctaLabelEn || "Learn more", locale)}
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Aftermovies */}
      {after && after.items.length > 0 && (
        <section>
          <h2 className="mb-6 text-2xl font-bold text-vtk-blue md:text-3xl">
            {pick(after.titleNl, after.titleEn, locale)}
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {after.items.map((item, i) =>
              item.type === "video" ? (
                <div
                  key={i}
                  className="aspect-video overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-sm"
                >
                  <iframe
                    src={item.url}
                    title={pick(item.titleNl || "Aftermovie", item.titleEn || "Aftermovie", locale)}
                    className="h-full w-full"
                    allowFullScreen
                  />
                </div>
              ) : (
                <img
                  key={i}
                  src={item.url}
                  alt={pick(item.titleNl || "", item.titleEn || "", locale)}
                  className="aspect-video w-full rounded-2xl border border-zinc-100 object-cover shadow-sm"
                />
              )
            )}
          </div>
        </section>
      )}

      {/* Albums */}
      {featuredAlbums.length > 0 && (
        <section>
          <h2 className="mb-6 text-2xl font-bold text-vtk-blue md:text-3xl">
            {locale === "nl" ? "Sfeerbeelden" : "Recent albums"}
          </h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featuredAlbums.map((album) => (
              <li key={album.id}>
                <Link
                  href={`${base}/fotos/${album.slug}`}
                  className="group block overflow-hidden rounded-2xl border border-transparent bg-white shadow-sm transition hover:border-vtk-blue/15 hover:shadow-md"
                >
                  {album.coverPhoto ? (
                    <img
                      src={publicUrl(album.coverPhoto.thumbnailKey || album.coverPhoto.storageKey) ?? ""}
                      alt={pick(album.titleNl, album.titleEn, locale)}
                      className="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="aspect-square bg-vtk-blue-soft" />
                  )}
                  <div className="px-1 py-3 text-sm font-semibold text-vtk-blue group-hover:underline">
                    {pick(album.titleNl, album.titleEn, locale)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
