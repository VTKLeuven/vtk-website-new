type Section = { heading: string; body: string };

/**
 * Simple readable article layout for static information pages such as the
 * member portal info page and the privacy statement. Body text supports line
 * breaks (rendered with whitespace-pre-line) so simple bullet lists written as
 * "• ..." lines display correctly.
 */
export function LegalArticle({
  kicker,
  title,
  lead,
  updated,
  sections,
}: {
  kicker: string;
  title: string;
  lead: string;
  updated?: string;
  sections: Section[];
}) {
  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">{kicker}</div>
          <h1 className="vtk-page-title">{title}</h1>
        </div>
      </header>
      <div className="vtk-page-shell vtk-page-narrow">
        <p className="text-lg leading-relaxed text-vtk-ink">{lead}</p>
        {updated && <p className="mt-2 text-sm text-[#5c667f]">{updated}</p>}
        <div className="mt-12 space-y-10">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="mb-3 text-xl font-semibold tracking-tight text-vtk-ink">
                {section.heading}
              </h2>
              <p className="whitespace-pre-line leading-relaxed text-[#3a4255]">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
