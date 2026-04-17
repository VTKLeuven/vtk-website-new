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
    <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10 md:py-14">
      <h1 className="mb-6 text-4xl font-bold tracking-tight text-vtk-blue md:text-5xl">
        {pick(page.titleNl, page.titleEn, locale)}
      </h1>
      <div className="prose-vtk">{renderTiptap(content)}</div>
      {downloads.length > 0 && (
        <section className="mt-10 rounded-2xl border border-vtk-blue/10 bg-vtk-blue-soft/50 p-6">
          <h2 className="mb-3 text-lg font-bold text-vtk-blue">{downloadsLabel}</h2>
          <ul className="space-y-2">
            {downloads.map((a) => {
              const href = publicUrl(a.storageKey);
              if (!href) return null;
              return (
                <li key={a.id}>
                  <a
                    href={href}
                    className="text-vtk-blue hover:underline"
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
