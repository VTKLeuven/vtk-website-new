import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingId, headingText } from "@/lib/pageOutline";

/**
 * Gedeelde markdown-renderer: dezelfde uitvoer op de publieke pagina's (server
 * component) en in het voorbeeld van de MarkdownEditor (client). Styling komt
 * van de omliggende container (bv. `prose-vtk`), niet van hier.
 *
 * Ruwe HTML in de markdown wordt bewust NIET gerenderd (geen rehype-raw):
 * pagina's worden door leden bewerkt, dus de uitvoer moet veilig blijven.
 */

type ImageProps = { title?: string };

/**
 * De afbeelding uit een alinea die verder niets bevat, of null.
 *
 * Dit gebeurt in de `p`-override en niet in een `img`-override, want een
 * `<figure>` binnen een `<p>` is ongeldige HTML: de browser sluit de alinea dan
 * zelf en React struikelt over het verschil met de server-uitvoer. Een
 * afbeelding midden in een zin blijft dus gewoon een inline `<img>`.
 */
function soleImage(children: ReactNode): ReactElement<ImageProps> | null {
  const items = Children.toArray(children).filter(
    (child) => typeof child !== "string" || child.trim() !== "",
  );
  const only = items.length === 1 ? items[0] : null;
  if (!only || !isValidElement(only) || only.type !== "img") return null;
  return only as ReactElement<ImageProps>;
}

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Een alinea met enkel een foto wordt een figuur; de markdown-titel
        // (`![alt](url "Cantus 2025")`) wordt het bijschrift. Zonder titel is
        // het gewoon een foto zonder onderschrift, geen leeg bijschrift.
        p: ({ children: paragraphChildren }) => {
          const image = soleImage(paragraphChildren);
          if (!image) return <p>{paragraphChildren}</p>;
          const caption = image.props.title;
          return (
            <figure className="vtk-figure">
              {/* De titel is hier het bijschrift; ze ook als tooltip laten staan
                  zou dezelfde tekst twee keer tonen. */}
              {caption ? cloneElement(image, { title: undefined }) : image}
              {caption ? <figcaption>{caption}</figcaption> : null}
            </figure>
          );
        },
        // Kopjes krijgen een anker, zodat de "Op deze pagina"-rail ernaartoe kan
        // linken. De id komt uit dezelfde helper als die rail (pageOutline).
        h2: ({ children: headingChildren }) => (
          <h2 id={headingId(headingText(headingChildren))}>{headingChildren}</h2>
        ),
        h3: ({ children: headingChildren }) => (
          <h3 id={headingId(headingText(headingChildren))}>{headingChildren}</h3>
        ),
        // Zelfde gedrag als de oude tiptap-renderer: links openen in een nieuw
        // tabblad. Interne ankers (#...) blijven in dezelfde pagina.
        a: ({ href, children: linkChildren }) => {
          const external = Boolean(href && !href.startsWith("#"));
          return (
            <a
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
            >
              {linkChildren}
            </a>
          );
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
