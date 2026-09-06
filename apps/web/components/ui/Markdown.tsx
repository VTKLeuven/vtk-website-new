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
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Kopjes krijgen een anker, zodat de "Op deze pagina"-rail ernaartoe kan
        // linken. De id komt uit dezelfde helper als die rail (pageOutline).
        // Ook H1: de paginatitel is de echte H1, dus een `#` in de tekst is een
        // sectiekop zoals elke andere.
        h1: ({ children: headingChildren }) => (
          <h1 id={headingId(headingText(headingChildren))}>{headingChildren}</h1>
        ),
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
