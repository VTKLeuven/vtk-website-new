import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingId, headingText } from "@/lib/pageOutline";
import { revealWords } from "@/lib/revealWords";

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

/**
 * Een kopje in losse woorden, of null wanneer er niets te splitsen valt.
 *
 * Enkel voor een kopje dat uit platte tekst bestaat. Staat er een link of een
 * vetgedrukt woord in, dan is er niets te splitsen zonder die opmaak te
 * verliezen; zo'n kopje animeert als één blok.
 */
function splitWords(children: ReactNode): ReactNode[] | null {
  const items = Children.toArray(children);
  const text = items.every((child) => typeof child === "string") ? items.join("") : null;
  if (text === null || !text.trim()) return null;
  return revealWords(text);
}

export function Markdown({
  children,
  /**
   * Kopjes bij het scrollen laten binnenkomen. Enkel de contentpagina's zetten
   * dit aan; elders (aankondiging, hulptekst bij een formulier, voorbeeld in de
   * editor) staat de tekst in een eigen scrollcontainer of in een dialoog, waar
   * een `view()`-tijdlijn niet klopt.
   */
  revealHeadings = false,
}: {
  children: string;
  revealHeadings?: boolean;
}) {
  // `data-reveal` zegt wat er animeert: de losse woorden, of het kopje als
  // geheel wanneer er opmaak in staat. vtk-motion.css hangt daaraan.
  const reveal = (headingChildren: ReactNode) => {
    if (!revealHeadings) return { "data-reveal": undefined, content: headingChildren };
    const words = splitWords(headingChildren);
    return {
      "data-reveal": words ? "words" : "block",
      content: words ?? headingChildren,
    };
  };
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
        h2: ({ children: headingChildren }) => {
          const { content, ...reveals } = reveal(headingChildren);
          return (
            <h2 id={headingId(headingText(headingChildren))} {...reveals}>
              {content}
            </h2>
          );
        },
        // H3 komt als blok binnen en niet woord per woord: tussentitels staan
        // dicht bij elkaar en woord-voor-woord wordt dan onrustig.
        h3: ({ children: headingChildren }) => (
          <h3
            id={headingId(headingText(headingChildren))}
            data-reveal={revealHeadings ? "block" : undefined}
          >
            {headingChildren}
          </h3>
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
