import { markdownToPlainText } from "@/lib/markdown";

/**
 * Kopjes van een contentpagina, voor de "Op deze pagina"-rail naast de tekst.
 *
 * H1 tot en met H3; dieper wordt de rail een tweede inhoudsopgave in plaats van
 * een houvast. H1 telt mee omdat de paginatitel al de echte H1 van het document
 * is: wie in de editor `#` kiest, bedoelt gewoon een sectiekop. Dat H1 hier ooit
 * niet meetelde, kostte pagina's stil hun hele rail (International Team had
 * `# Wat we voor jou doen` en één `## Contact`, dus één item, en de rail
 * verschijnt pas vanaf twee). H1 en H2 zijn daarom hetzelfde niveau in de lijst;
 * enkel H3 springt in.
 *
 * De id's die hier berekend worden moeten exact overeenkomen met wat de
 * renderers zetten (`Markdown` voor markdown, `renderTiptap` voor de oude
 * JSON-documenten), anders springt een link nergens naartoe. Daarom leidt
 * iedereen zijn id af via {@link headingId}.
 */
export type OutlineItem = { id: string; text: string; level: 2 | 3 };

/**
 * Kopje -> anker. Bewust alleen op basis van de tekst: twee kopjes met exact
 * dezelfde titel delen dan hun anker (de link springt naar de eerste), en dat
 * is beter dan renderer en rail die elk hun eigen nummering verzinnen.
 */
export function headingId(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `sectie-${slug}` : "";
}

/** Platte tekst uit React-children of een tiptap-node; nodig voor het anker. */
export function headingText(value: unknown): string {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(headingText).join("");
  if (typeof value === "object") {
    const node = value as { props?: { children?: unknown }; text?: unknown; content?: unknown };
    if (typeof node.text === "string") return node.text;
    if (node.content !== undefined) return headingText(node.content);
    if (node.props?.children !== undefined) return headingText(node.props.children);
  }
  return "";
}

export function outlineFromMarkdown(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = markdownToPlainText(match[2]);
    const id = headingId(text);
    if (!text || !id) continue;
    items.push({ id, text, level: match[1].length === 3 ? 3 : 2 });
  }
  return items;
}

type TiptapNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
};

export function outlineFromTiptap(doc: unknown): OutlineItem[] {
  const items: OutlineItem[] = [];
  const walk = (node: TiptapNode | undefined) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "heading") {
      const level = Number(node.attrs?.level ?? 2);
      if (level >= 1 && level <= 3) {
        const text = headingText(node.content).trim();
        const id = headingId(text);
        // H1 en H2 delen hun niveau in de rail; zie de opmerking hierboven.
        if (text && id) items.push({ id, text, level: level === 3 ? 3 : 2 });
      }
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc as TiptapNode);
  return items;
}

/** Een anker op de pagina en waar het in het document staat (in pixels). */
export type Anchor = { id: string; top: number };

/**
 * Welk anker "gelezen" is bij deze scrollpositie.
 *
 * De gewone regel is: het laatste anker dat de leesregel voorbij is. Onderaan
 * loopt die regel stuk, want de laatste kopjes staan in het laatste scherm en
 * halen de leesregel nooit meer; er is geen scrollruimte meer onder ze. Zonder
 * correctie sprong de rail van het laatste bereikbare kopje meteen naar het
 * allerlaatste en lichtten de kopjes ertussen nooit op.
 *
 * Die onbereikbare staart verdeelt daarom de laatste centimeters scroll onder
 * elkaar: scroll je het laatste stuk uit, dan loopt de rail er nog netjes
 * doorheen. Is er helemaal geen ruimte meer over, dan wint het laatste kopje,
 * zodat een sprong vanuit de rail naar het slot toch oplicht.
 */
export function activeAnchor(
  anchors: readonly Anchor[],
  view: { scrolled: number; maxScroll: number; readingLine: number },
): string | null {
  if (anchors.length === 0) return null;

  // De scrollpositie waarop elk anker de leesregel haalt.
  const marks = anchors.map((anchor) => ({
    id: anchor.id,
    at: anchor.top - view.readingLine,
  }));

  // De ankers staan in documentvolgorde, dus de onbereikbare zijn een staart.
  let tailStart = marks.length;
  while (tailStart > 0 && marks[tailStart - 1].at > view.maxScroll) tailStart -= 1;

  const tail = marks.slice(tailStart);
  if (tail.length > 0) {
    const from = tailStart > 0 ? marks[tailStart - 1].at : 0;
    const step = Math.max(0, (view.maxScroll - from) / tail.length);
    tail.forEach((mark, index) => {
      mark.at = from + step * (index + 1);
    });
  }

  const passed = marks.filter((mark) => view.scrolled >= mark.at);
  return passed.length > 0 ? passed[passed.length - 1].id : marks[0].id;
}
