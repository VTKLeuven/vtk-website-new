import Link from "next/link";
import { publicUrl } from "@/lib/storage";
import { renderTiptap } from "@/lib/tiptap-render";
import { Markdown } from "@/components/ui/Markdown";
import { outlineFromMarkdown, outlineFromTiptap, type OutlineItem } from "@/lib/pageOutline";
import { pick, type Locale } from "@vtk/i18n";
import type { HeaderTab, Page, PageAsset } from "@prisma/client";
import type { ReactNode } from "react";

/**
 * Inhoud voor de gevraagde taal. Markdown is de bron van waarheid: zodra een
 * taal een markdown-waarde heeft (ook een lege), rendert het legacy tiptap-JSON
 * niet meer. Een taal zonder eigen versie valt terug op NL.
 */
function renderContent(page: Page, locale: Locale): ReactNode {
  if (locale === "en") {
    if (page.contentMdEn !== null) return <Markdown>{page.contentMdEn}</Markdown>;
    if (page.contentJsonEn) return renderTiptap(page.contentJsonEn);
    // Geen Engelse versie: val terug op NL.
  }
  if (page.contentMdNl !== null) return <Markdown>{page.contentMdNl}</Markdown>;
  return renderTiptap(page.contentJsonNl);
}

/** Kopjes van de getoonde taalversie; volgt dezelfde terugvalregels als hierboven. */
function outline(page: Page, locale: Locale): OutlineItem[] {
  if (locale === "en") {
    if (page.contentMdEn !== null) return outlineFromMarkdown(page.contentMdEn);
    if (page.contentJsonEn) return outlineFromTiptap(page.contentJsonEn);
  }
  if (page.contentMdNl !== null) return outlineFromMarkdown(page.contentMdNl);
  return outlineFromTiptap(page.contentJsonNl);
}

export function PageView({
  page,
  locale,
  downloadsLabel,
  onThisPageLabel,
}: {
  page: Page & { assets: PageAsset[]; headerTab?: HeaderTab | null };
  locale: Locale;
  downloadsLabel: string;
  onThisPageLabel: string;
}) {
  const base = locale === "nl" ? "" : "/en";
  const downloads = page.assets.filter((a) => a.kind === "DOWNLOAD");
  const title = pick(page.titleNl, page.titleEn, locale);
  const excerpt = pick(page.excerptNl ?? "", page.excerptEn ?? "", locale);
  const tab = page.headerTab ?? null;

  // Eén kopje is geen inhoudsopgave maar een herhaling van de titel; vanaf twee
  // wordt de rail nuttig. Zonder kopjes en zonder downloads valt ze helemaal weg
  // en leest de pagina als een gewone tekstkolom.
  const headings = outline(page, locale);
  const showOutline = headings.length >= 2;
  const showRail = showOutline || downloads.length > 0;

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          {tab ? (
            <div className="vtk-page-kicker">
              <Link href={`${base}/${tab.slug}`} className="vtk-crumb">
                {pick(tab.labelNl, tab.labelEn, locale)}
              </Link>
              <span aria-hidden="true"> › </span>
              <span>{title}</span>
            </div>
          ) : null}
          <h1 className="vtk-page-title">{title}</h1>
          {excerpt ? <p className="vtk-page-subtitle">{excerpt}</p> : null}
        </div>
      </header>

      <div className={`vtk-page-shell vtk-page-body${showRail ? " has-rail" : ""}`}>
        <article className="prose-vtk">{renderContent(page, locale)}</article>

        {showRail ? (
          <aside className="vtk-page-rail">
            {showOutline ? (
              <nav className="vtk-rail-box" aria-label={onThisPageLabel}>
                <h2>{onThisPageLabel}</h2>
                <ul>
                  {headings.map((item) => (
                    <li key={`${item.id}-${item.level}`}>
                      <a href={`#${item.id}`} className={item.level === 3 ? "is-sub" : undefined}>
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}

            {downloads.length > 0 ? (
              <section className="vtk-rail-box">
                <h2>{downloadsLabel}</h2>
                <ul>
                  {downloads.map((a) => {
                    const href = publicUrl(a.storageKey);
                    if (!href) return null;
                    return (
                      <li key={a.id}>
                        <a href={href} download>
                          {pick(a.labelNl, a.labelEn, locale)}
                          {a.sizeBytes ? (
                            <span className="vtk-rail-meta">
                              {" "}
                              ({(a.sizeBytes / 1024 / 1024).toFixed(1)} MB)
                            </span>
                          ) : null}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
