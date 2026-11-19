import type { Nodes, Parent, PhrasingContent, Root } from "mdast";

const NEWLINE = /\r?\n|\r/;

/**
 * Remark-plugin: een enkele enter in de markdown wordt een regeleinde (`<br>`).
 *
 * Standaard-markdown voegt twee regels zonder witregel ertussen samen tot één
 * zin; enkel een lege regel begint een nieuwe alinea. Wie in de editor een
 * lijstje onder elkaar typt ("🍝 Pasta", "🎲 Bordspellen", ...), zag het in het
 * voorbeeld en op de site dan achter elkaar op één regel staan. Wat er in het
 * tekstvak onder elkaar staat, staat nu ook op de pagina onder elkaar.
 *
 * Code (`code`, `inlineCode`) heeft geen `text`-kinderen en blijft dus zoals ze
 * was. Een witregel blijft een nieuwe alinea.
 */
export function remarkLineBreaks() {
  return (tree: Root) => {
    splitNewlines(tree);
  };
}

function splitNewlines(node: Nodes): void {
  if (!("children" in node)) return;
  const parent = node as Parent;
  const next: Parent["children"] = [];
  for (const child of parent.children) {
    if (child.type === "text" && NEWLINE.test(child.value)) {
      child.value.split(NEWLINE).forEach((part, index) => {
        if (index > 0) next.push({ type: "break" } satisfies PhrasingContent);
        if (part) next.push({ type: "text", value: part } satisfies PhrasingContent);
      });
      continue;
    }
    splitNewlines(child);
    next.push(child);
  }
  parent.children = next;
}
