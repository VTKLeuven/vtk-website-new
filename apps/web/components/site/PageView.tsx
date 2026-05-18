import { publicUrl } from "@/lib/storage";
import { renderTiptap } from "@/lib/tiptap-render";
import { pick, type Locale } from "@vtk/i18n";
import type { Page, PageAsset } from "@prisma/client";

export function PageView({
  page,
  locale,
  downloadsLabel,
}: {
  page: Page & { assets: PageAsset[] };
  locale: Locale;
  downloadsLabel: string;
}) {
  const content = locale === "en" ? page.contentJsonEn ?? page.contentJsonNl : page.contentJsonNl;
  const downloads = page.assets.filter((a) => a.kind === "DOWNLOAD");

  return (
    <article className="vtk-page vtk-page-shell vtk-page-narrow">
      <h1 className="vtk-page-title mb-8">
        {pick(page.titleNl, page.titleEn, locale)}
      </h1>
      <div className="prose-vtk">{renderTiptap(content)}</div>
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
