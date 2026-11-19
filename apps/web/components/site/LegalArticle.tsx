type Section = { heading: string; body: string };

type BodyBlock =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; items: string[] };

/** Splits plain paragraphs and "• " bullet runs into semantic blocks. */
function parseBodyBlocks(body: string): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  for (const rawLine of body.split("\n")) {
    const trimmed = rawLine.trimStart();
    if (trimmed.startsWith("• ")) {
      const item = trimmed.slice(2).trim();
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === "list") {
        prev.items.push(item);
      } else {
        blocks.push({ kind: "list", items: [item] });
      }
    } else {
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === "paragraph") {
        prev.lines.push(rawLine);
      } else {
        blocks.push({ kind: "paragraph", lines: [rawLine] });
      }
    }
  }
  return blocks;
}

/**
 * Simple readable article layout for static information pages such as the
 * member portal info page and the privacy statement. Body text supports line
 * breaks (rendered with whitespace-pre-line) and "• ..." bullet blocks
 * rendered as semantic <ul><li> lists.
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
              <div className="space-y-3 leading-relaxed text-[#3a4255]">
                {parseBodyBlocks(section.body).map((block, index) =>
                  block.kind === "list" ? (
                    <ul key={index} className="list-disc space-y-1.5 pl-6">
                      {block.items.map((item, itemIndex) => (
                        <li key={itemIndex}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p key={index} className="whitespace-pre-line">
                      {block.lines.join("\n")}
                    </p>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
