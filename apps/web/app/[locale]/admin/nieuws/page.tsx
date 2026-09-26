import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { utcToLocalDateTime } from "@/lib/ticketing/time";
import { collectNews, readNewsSettingFromDb } from "@/lib/news/load";
import { composeNews, postInNews } from "@/lib/news/rules";
import { newsSourceLabel } from "@/lib/news/labels";
import { NewsManager, type NewsCandidateRow, type NewsPostRow } from "./NewsManager";

export default async function AdminNews({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("news.manage");

  const now = new Date();
  const setting = await readNewsSettingFromDb();
  const [candidates, posts] = await Promise.all([
    collectNews(locale, now, setting),
    prisma.newsPost.findMany({
      orderBy: [{ publishedAt: "desc" }],
      include: { createdBy: { select: { name: true } } },
    }),
  ]);

  // Waar elk bericht nu staat: uitgelicht, in de band, of erbuiten omdat de band
  // vol zit. Dezelfde samenstelling als de homepage, zodat het beheer niets
  // anders belooft dan wat er staat.
  const { featured, rest } = composeNews(
    candidates.filter((entry) => !entry.hidden),
    setting.count,
  );
  const inBand = new Set(rest.map((entry) => entry.key));

  const dateFormat = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const candidateRows: NewsCandidateRow[] = [...candidates]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((entry) => ({
      key: entry.key,
      source: entry.source,
      sourceLabel: newsSourceLabel(entry.source, locale),
      ref: entry.ref,
      title: entry.title,
      line: entry.line,
      dateLabel: dateFormat.format(new Date(entry.date)),
      automatic: entry.source !== "notice" && entry.source !== "praeses",
      place: entry.hidden
        ? "hidden"
        : featured?.key === entry.key
          ? "featured"
          : inBand.has(entry.key)
            ? "band"
            : "overflow",
    }));

  const postRows: NewsPostRow[] = posts.map((post) => ({
    id: post.id,
    kind: post.kind,
    titleNl: post.titleNl,
    titleEn: post.titleEn ?? "",
    bodyNl: post.bodyNl,
    bodyEn: post.bodyEn ?? "",
    ctaLabelNl: post.ctaLabelNl ?? "",
    ctaLabelEn: post.ctaLabelEn ?? "",
    ctaUrl: post.ctaUrl ?? "",
    imageKey: post.imageKey,
    authorName: post.authorName ?? "",
    authorRoleNl: post.authorRoleNl ?? "",
    authorRoleEn: post.authorRoleEn ?? "",
    publishedAt: utcToLocalDateTime(post.publishedAt),
    endsAt: post.endsAt ? utcToLocalDateTime(post.endsAt) : "",
    featured: post.featured,
    active: post.active,
    status: !post.active
      ? "off"
      : post.publishedAt > now
        ? "scheduled"
        : postInNews(post, now)
          ? "live"
          : "expired",
    dateLabel: dateFormat.format(post.publishedAt),
    authorLabel: post.createdBy?.name ?? null,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Nieuws" : "News"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? "De band tussen de snelle links en de openingsuren op de homepage. Ticketverkoop, inschrijvingen, het Bakske, Ir.Reëel en nieuwe fotoalbums komen er vanzelf in; een mededeling of een woordje van de praeses schrijf je hier."
            : "The band between the quick links and the opening hours on the homepage. Ticket sales, sign-ups, Het Bakske, Ir.Reëel and new photo albums appear by themselves; a notice or a word from the praeses is written here."}
        </p>
      </header>

      <NewsManager
        locale={locale}
        setting={setting}
        candidates={candidateRows}
        posts={postRows}
      />
    </div>
  );
}
