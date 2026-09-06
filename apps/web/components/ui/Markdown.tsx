import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DEFAULT_LOCALE, type Locale } from "@vtk/i18n";
import { galleryPhotos } from "@/lib/gallery";
import { headingId, headingText } from "@/lib/pageOutline";
import { isVideoUrl } from "@/lib/videoEmbed";
import { PageGallery } from "@/components/site/PageGallery";
import { InlineVideoPlayer } from "./InlineVideoPlayer";

/**
 * Zet ingesloten video-iframes of losstaande video-links om naar de markdown-media-syntax `![Titel](url)`.
 */
export function preprocessMarkdownVideos(markdown: string): string {
  if (!markdown) return "";

  // 1. Converteer legacy/geplakte YouTube- of Vimeo-iframes:
  let result = markdown.replace(
    /<iframe[^>]*\bsrc=["'](?:https?:)?\/\/([^"']+)["'][^>]*>(?:<\/iframe>)?/gi,
    (_match, src) => {
      const fullUrl = src.startsWith("//") ? `https:${src}` : src.startsWith("http") ? src : `https://${src}`;
      return `\n\n![Video](${fullUrl})\n\n`;
    }
  );

  // 2. Converteer losstaande video-links op een eigen regel:
  result = result.replace(
    /(?:^|\n\n)([ \t]*)(https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=[a-zA-Z0-9_-]+|embed\/[a-zA-Z0-9_-]+|shorts\/[a-zA-Z0-9_-]+)|youtu\.be\/[a-zA-Z0-9_-]+|vimeo\.com\/\d+)[^\s]*)([ \t]*)(?=\n\n|$)/g,
    "\n\n![Video]($2)\n\n"
  );

  return result;
}

/**
 * Gedeelde markdown-renderer: dezelfde uitvoer op de publieke pagina's (server
 * component) en in het voorbeeld van de MarkdownEditor (client). Styling komt
 * van de omliggende container (bv. `prose-vtk`), niet van hier.
 *
 * Ruwe HTML in de markdown wordt bewust NIET gerenderd (geen rehype-raw):
 * pagina's worden door leden bewerkt, dus de uitvoer moet veilig blijven.
 *
 * De taal is enkel nodig voor de knoplabels van een fotogalerij. Ze is
 * optioneel, zodat een oproep zonder taal blijft werken; geef ze mee waar de
 * locale toch al in de hand is.
 */
export function Markdown({
  children,
  locale = DEFAULT_LOCALE,
}: {
  children: string;
  locale?: Locale;
}) {
  const content = preprocessMarkdownVideos(children);

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
        // Twee of meer afbeeldingen die in de markdown tegen elkaar aan staan,
        // vormen samen een galerij. Alles wat daar niet aan voldoet (tekst
        // ertussen, een enkele foto, een video) blijft een gewone alinea.
        p: ({ node, children: paragraphChildren }) => {
          const photos = galleryPhotos(node);
          if (photos) return <PageGallery photos={photos} locale={locale} />;
          return <p>{paragraphChildren}</p>;
        },
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
        img: ({ src, alt }) => {
          const srcString = typeof src === "string" ? src : undefined;
          if (srcString && isVideoUrl(srcString)) {
            return <InlineVideoPlayer src={srcString} title={alt || undefined} />;
          }
          // eslint-disable-next-line @next/next/no-img-element
          return <img src={src} alt={alt} />;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
