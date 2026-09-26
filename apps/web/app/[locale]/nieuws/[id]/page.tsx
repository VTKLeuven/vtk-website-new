import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArrowRight } from "lucide-react";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { Markdown } from "@/components/ui/Markdown";
import { hasLocale } from "@/lib/locale";
import { buildMetadata } from "@/lib/seo";
import { publicUrl } from "@/lib/storage";
import { markdownToPlainText } from "@/lib/markdown";
import { newsSourceLabel } from "@/lib/news/labels";
import { NewsAuthor, NewsLink } from "@/components/editorial/NewsBand";

import "@/app/design/vtk-news.css";

export const dynamic = "force-dynamic";

/**
 * Een mededeling of een woordje van de praeses, voluit. Een bericht dat nog
 * niet verschenen is of uitgezet werd, bestaat hier niet; een afgelopen bericht
 * wel, want /nieuws linkt ernaar als historiek.
 */
const readPost = cache(async (id: string) => {
  const post = await prisma.newsPost.findUnique({ where: { id } });
  if (!post || !post.active || post.publishedAt > new Date()) return null;
  return post;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  if (!hasLocale(locale)) return {};
  const post = await readPost(id);
  if (!post) return {};
  return buildMetadata({
    title: pick(post.titleNl, post.titleEn, locale),
    description: markdownToPlainText(pick(post.bodyNl, post.bodyEn, locale)),
    path: `/nieuws/${post.id}`,
    locale,
    image: post.kind === "NOTICE" ? publicUrl(post.imageKey) ?? undefined : undefined,
  });
}

export default async function NewsPostPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const post = await readPost(id);
  if (!post) notFound();

  const praeses = post.kind === "PRAESES";
  const title = pick(post.titleNl, post.titleEn, locale);
  const body = pick(post.bodyNl, post.bodyEn, locale);
  const photo = praeses ? null : publicUrl(post.imageKey);
  const ctaLabel = pick(post.ctaLabelNl ?? "", post.ctaLabelEn, locale) || (nl ? "Meer lezen" : "Read more");
  const date = post.publishedAt.toLocaleDateString(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">
            <Link href={`${base}/nieuws`} className="vtk-crumb">
              {nl ? "Nieuws" : "News"}
            </Link>
            <span aria-hidden="true"> › </span>
            <span>{newsSourceLabel(praeses ? "praeses" : "notice", locale)}</span>
          </div>
          <h1 className="vtk-page-title">{title}</h1>
          <p className="vtk-page-subtitle">{date}</p>
        </div>
      </header>

      {/* Niet `vtk-page-narrow`: dat centreert de hele kolom, en dan begint de
          tekst een eind rechts van de titel erboven. De leesbreedte zit op
          `.news-post` zelf. */}
      <main className="vtk-page-shell">
        <article className="vtk-page-content news-post">
          {photo ? (
            // Een upload uit de eigen media-route.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="news-post-photo" src={photo} alt="" />
          ) : null}
          <div className="prose-vtk">
            <Markdown locale={locale}>{body}</Markdown>
          </div>
          {praeses && post.authorName ? (
            <NewsAuthor
              author={{
                name: post.authorName,
                role: pick(post.authorRoleNl ?? "", post.authorRoleEn, locale) || null,
                imageUrl: publicUrl(post.imageKey),
              }}
            />
          ) : null}
          {post.ctaUrl ? (
            <div>
              <NewsLink href={post.ctaUrl} base={base} className="news-go is-primary">
                {ctaLabel} <ArrowRight size={15} aria-hidden="true" />
              </NewsLink>
            </div>
          ) : null}
        </article>
      </main>
    </div>
  );
}
