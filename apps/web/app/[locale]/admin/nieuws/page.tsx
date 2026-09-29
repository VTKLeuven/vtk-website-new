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

  // Waar elk bericht nu staat: uitgelicht of in de band. Dezelfde samenstelling
  // als de homepage, zodat het beheer niets anders belooft dan wat er staat.
  const { featured } = composeNews(
    candidates.filter((entry) => !entry.hidden),
    now,
  );

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
      picked: entry.featured,
      place: entry.hidden ? "hidden" : featured?.key === entry.key ? "featured" : "band",
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
    <NewsManager locale={locale} setting={setting} candidates={candidateRows} posts={postRows} />
  );
}
