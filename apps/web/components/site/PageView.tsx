import { publicUrl } from "@/lib/storage";
import { renderTiptap } from "@/lib/tiptap-render";
import { Markdown } from "@/components/ui/Markdown";
import { pick, type Locale } from "@vtk/i18n";
import type { Page, PageAsset } from "@prisma/client";
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

export function PageView({
  page,
  locale,
  downloadsLabel,
}: {
  page: Page & { assets: PageAsset[] };
  locale: Locale;
  downloadsLabel: string;
}) {
  const downloads = page.assets.filter((a) => a.kind === "DOWNLOAD");

  return (
    <article className="vtk-page vtk-page-shell vtk-page-narrow">
      <h1 className="vtk-page-title mb-8">
        {pick(page.titleNl, page.titleEn, locale)}
      </h1>
      <div className="prose-vtk">{renderContent(page, locale)}</div>
      {downloads.length > 0 && (
        <section className="vtk-panel mt-10 p-6">
          <h2 className="mb-3 text-lg font-semibold text-vtk-ink">{downloadsLabel}</h2>
          <ul className="space-y-2">
            {downloads.map((a) => {
              const href = publicUrl(a.storageKey);
              if (!href) return null;
              return (
                <li key={a.id}>
                  <a
                    href={href}
                    className="vtk-link"
                    download
                  >
                    {pick(a.labelNl, a.labelEn, locale)}
                    {a.sizeBytes ? ` (${(a.sizeBytes / 1024 / 1024).toFixed(1)} MB)` : ""}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </article>
  );
}
