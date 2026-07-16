/**
 * Eenmalige conversie van legacy tiptap-JSON (contentJsonNl/En) naar markdown.
 *
 * Markdown is de nieuwe bron van waarheid voor pagina-inhoud. Pagina's die nog
 * geen markdown hebben, krijgen in de editor deze conversie als voorinvulling;
 * bij de eerste keer opslaan staat de pagina definitief op markdown. De persoon
 * die opslaat ziet het resultaat dus altijd zelf na.
 *
 * De ondersteunde node-set is dezelfde als die van lib/tiptap-render.tsx.
 * Bewuste vereenvoudigingen:
 *  - underline bestaat niet in markdown en wordt gewone tekst;
 *  - pdfEmbed wordt een gewone link (PDF's horen bij de bijlagen van de pagina,
 *    niet in de inhoud).
 */

type Mark = { type: string; attrs?: Record<string, unknown> };

type Node = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  marks?: Mark[];
  text?: string;
};

function applyMarks(text: string, marks: Mark[] | undefined): string {
  if (!marks || marks.length === 0 || text.trim() === "") return text;
  let out = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "code":
        out = `\`${out}\``;
        break;
      case "bold":
        out = `**${out}**`;
        break;
      case "italic":
        out = `*${out}*`;
        break;
      case "strike":
        out = `~~${out}~~`;
        break;
      case "link": {
        const href = (mark.attrs?.href as string | undefined) || "";
        out = `[${out}](${href})`;
        break;
      }
      // underline: geen markdown-equivalent; de tekst blijft gewoon staan.
      default:
        break;
    }
  }
  return out;
}

function inline(nodes: Node[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return applyMarks(node.text ?? "", node.marks);
        case "hardBreak":
          // Twee spaties + newline = harde regeleinde in markdown.
          return "  \n";
        case "image": {
          const src = (node.attrs?.src as string | undefined) ?? "";
          const alt = (node.attrs?.alt as string | undefined) ?? "";
          return `![${alt}](${src})`;
        }
        default:
          return inline(node.content);
      }
    })
    .join("");
}

/** Prefixt elke regel; vervolgregels kunnen een andere prefix krijgen (lijsten). */
function prefixLines(text: string, first: string, rest: string): string {
  return text
    .split("\n")
    .map((line, i) => (i === 0 ? first + line : rest + line))
    .join("\n");
}

function block(node: Node): string {
  const children = () => blocks(node.content);

  switch (node.type) {
    case "paragraph":
      return inline(node.content);
    case "heading": {
      const level = Math.min(Math.max((node.attrs?.level as number | undefined) ?? 2, 1), 6);
      return `${"#".repeat(level)} ${inline(node.content)}`;
    }
    case "bulletList":
      return (node.content ?? [])
        .map((item) => prefixLines(blocks(item.content), "- ", "  "))
        .join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((item, i) => prefixLines(blocks(item.content), `${i + 1}. `, "   "))
        .join("\n");
    case "blockquote":
      return prefixLines(children(), "> ", "> ");
    case "codeBlock":
      return `\`\`\`\n${inline(node.content)}\n\`\`\``;
    case "horizontalRule":
      return "---";
    case "image": {
      const src = (node.attrs?.src as string | undefined) ?? "";
      const alt = (node.attrs?.alt as string | undefined) ?? "";
      return `![${alt}](${src})`;
    }
    case "pdfEmbed": {
      // PDF's horen in de bijlagen; van de embed blijft enkel een link over.
      const src = (node.attrs?.src as string | undefined) ?? "";
      const title = (node.attrs?.title as string | undefined) || "PDF";
      return `[${title}](${src})`;
    }
    default:
      return node.content ? blocks(node.content) : inline([node]);
  }
}

function blocks(nodes: Node[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map(block)
    .filter((b) => b.trim() !== "")
    .join("\n\n");
}

/** Converteert een tiptap-document naar markdown; leeg document geeft "". */
export function tiptapToMarkdown(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const doc = json as Node;
  return blocks(doc.content).trim();
}
