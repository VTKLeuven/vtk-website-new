import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
