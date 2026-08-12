import { markdownToPlainText } from "@/lib/markdown";

/**
 * Kopjes van een contentpagina, voor de "Op deze pagina"-rail naast de tekst.
 *
 * Enkel H2 en H3: dieper wordt de rail een tweede inhoudsopgave in plaats van
 * een houvast. De id's die hier berekend worden moeten exact overeenkomen met
 * wat de renderers zetten (`Markdown` voor markdown, `renderTiptap` voor de
 * oude JSON-documenten), anders springt een link nergens naartoe. Daarom leidt
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
    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = markdownToPlainText(match[2]);
    const id = headingId(text);
    if (!text || !id) continue;
    items.push({ id, text, level: match[1].length === 2 ? 2 : 3 });
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
      if (level === 2 || level === 3) {
        const text = headingText(node.content).trim();
        const id = headingId(text);
        if (text && id) items.push({ id, text, level });
      }
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc as TiptapNode);
  return items;
}
