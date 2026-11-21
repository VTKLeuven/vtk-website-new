/**
 * Maakt van Markdown een compacte tekst voor zoekresultaten en previews waar
 * rijke HTML niet past. De volledige inhoud moet met de Markdown-component
 * gerenderd worden.
 */
/**
 * Haalt elke iframe weg, ook een die pas ontstaat nadat een andere wegviel
 * (`<ifr<iframe>ame ...>`): herhaal tot er niets meer verandert.
 */
export function stripIframes(input: string): string {
  let out = input;
  let previous: string;
  do {
    previous = out;
    out = out.replace(/<iframe[\s\S]*?<\/iframe>/gi, "").replace(/<iframe[^>]*\/?>/gi, "");
  } while (out !== previous);
  return out;
}

export function markdownToPlainText(markdown: string): string {
  return stripIframes(markdown)
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*(?:[-+*]|\d+\.)\s+/gm, "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}
