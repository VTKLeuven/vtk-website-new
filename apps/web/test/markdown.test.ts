import { describe, expect, it } from "vitest";
import { markdownToPlainText } from "@/lib/markdown";

describe("markdownToPlainText", () => {
  it("removes supported formatting while preserving readable text", () => {
    const markdown = [
      "# Titel",
      "",
      "**Vet**, *cursief*, `code` en [een link](https://vtk.be).",
      "",
      "> Een citaat",
      "",
      "- Eerste punt",
      "- ![Poster](https://vtk.be/poster.jpg)",
      "",
      "---",
    ].join("\n");

    expect(markdownToPlainText(markdown)).toBe(
      "Titel Vet, cursief, code en een link. Een citaat Eerste punt Poster",
    );
  });

  it("keeps the contents of fenced code blocks", () => {
    expect(markdownToPlainText("```ts\nconst answer = 42;\n```")).toBe("const answer = 42;");
  });

  it("strips iframe tags from plain text preview", () => {
    expect(
      markdownToPlainText(
        'Voor de video:\n<iframe src="https://www.youtube.com/embed/fdzNbratIFk"></iframe>\nNa de video.',
      ),
    ).toBe("Voor de video: Na de video.");
  });
});

import { preprocessMarkdownVideos } from "@/components/ui/Markdown";
import { isVideoUrl } from "@/lib/videoEmbed";

describe("preprocessMarkdownVideos", () => {
  it("converts pasted YouTube iframe tags to markdown video syntax", () => {
    const input =
      'Bekijk de video:\n\n<iframe width="560" height="315" src="https://www.youtube.com/embed/fdzNbratIFk" title="YouTube video player" frameborder="0" allowfullscreen></iframe>\n\nVeel succes!';
    const output = preprocessMarkdownVideos(input);
    expect(output).toContain("![Video](https://www.youtube.com/embed/fdzNbratIFk)");
  });

  it("converts standalone YouTube and Vimeo URLs to video syntax", () => {
    const input =
      "Eerste paragraaf.\n\nhttps://www.youtube.com/watch?v=WdGqhrVUJog\n\nhttps://vimeo.com/12345678\n\nLaatste paragraaf.";
    const output = preprocessMarkdownVideos(input);
    expect(output).toContain("![Video](https://www.youtube.com/watch?v=WdGqhrVUJog)");
    expect(output).toContain("![Video](https://vimeo.com/12345678)");
  });

  it("preserves inline YouTube links in sentences without turning them into full embeds", () => {
    const input =
      "Bekijk [hier](https://www.youtube.com/watch?v=Fid9AZ6Zs3o) alvast onze promovideo!";
    const output = preprocessMarkdownVideos(input);
    expect(output).toBe(input);
  });
});

describe("isVideoUrl", () => {
  it("identifies YouTube and Vimeo URLs as videos", () => {
    expect(isVideoUrl("https://www.youtube.com/watch?v=WdGqhrVUJog")).toBe(true);
    expect(isVideoUrl("https://youtu.be/WdGqhrVUJog")).toBe(true);
    expect(isVideoUrl("https://www.youtube-nocookie.com/embed/WdGqhrVUJog")).toBe(true);
    expect(isVideoUrl("https://vimeo.com/12345678")).toBe(true);
    expect(isVideoUrl("/api/media/files/video.mp4")).toBe(true);
    expect(isVideoUrl("https://example.com/movie.webm")).toBe(true);
  });

  it("rejects regular images and non-video URLs", () => {
    expect(isVideoUrl("/api/media/images/logo.png")).toBe(false);
    expect(isVideoUrl("https://vtk.be/banner.jpg")).toBe(false);
    expect(isVideoUrl("https://google.com")).toBe(false);
    expect(isVideoUrl("")).toBe(false);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/ui/Markdown";

function render(markdown: string): string {
  return renderToStaticMarkup(createElement(Markdown, null, markdown));
}

/**
 * Een foto zonder gereserveerde hoogte duwt bij het laden de hele tekst eronder
 * naar beneden, en omdat de onthulling van die tekst aan een `view()`-tijdlijn
 * hangt, wordt elke regel die meeschuift weer onzichtbaar. De maten staan al in
 * de URL; ze moeten enkel op de `img` terechtkomen.
 */
describe("maten van een foto in de tekst", () => {
  it("zet de maten uit de URL op een losstaande foto", () => {
    const html = render('![Arenberg](/api/media/images/foto.jpg?w=1600&h=1067 "Bijschrift")');
    expect(html).toContain('width="1600"');
    expect(html).toContain('height="1067"');
  });

  it("zet ze ook op een foto midden in een alinea", () => {
    const html = render("Kijk ![Arenberg](/api/media/images/foto.jpg?w=800&h=600) hier.");
    expect(html).toContain('width="800"');
    expect(html).toContain('height="600"');
  });

  it("verzint geen maten voor een foto zonder maten in haar URL", () => {
    const html = render("![Arenberg](/api/media/images/foto.jpg)");
    expect(html).toContain("<img");
    expect(html).not.toContain("width=");
    expect(html).not.toContain("height=");
  });
});

/**
 * Een video is een `<div>`. Staat ze in dezelfde alinea als tekst, dan belandt
 * die `<div>` binnen een `<p>`: de browser sluit de alinea er zelf voor, en
 * React geeft bij de hydration fout #418 en rendert de hele pagina opnieuw.
 */
describe("video in een alinea met tekst", () => {
  const video = "![Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)";
  const blockInParagraph = /<p>(?:(?!<\/p>).)*<div/s;

  it("zet de video tussen twee alinea's in plaats van erin", () => {
    const html = render(`Vorig jaar:\n${video}\nEn dit jaar opnieuw.`);
    expect(html).not.toMatch(blockInParagraph);
    expect(html).toMatch(/<p>Vorig jaar:\s*<\/p><div/);
    expect(html).toMatch(/<\/div><p>\s*En dit jaar opnieuw.<\/p>/);
  });

  it("maakt geen lege alinea wanneer er enkel witruimte rond de video staat", () => {
    const html = render(`Vorig jaar:\n${video}`);
    expect(html).not.toMatch(blockInParagraph);
    expect(html.match(/<p>/g)).toHaveLength(1);
  });

  it("laat een alinea zonder video ongemoeid", () => {
    expect(render("Gewoon tekst met [een link](https://vtk.be).")).toBe(
      '<p>Gewoon tekst met <a href="https://vtk.be" target="_blank" rel="noopener noreferrer">een link</a>.</p>'
    );
  });
});

import { smallVideoThumbnailUrl, youtubeThumbnailUrl } from "@/lib/videoEmbed";

describe("miniatuur van een videoposter", () => {
  it("vraagt de kleine variant van onze eigen thumbnail-route", () => {
    expect(smallVideoThumbnailUrl(youtubeThumbnailUrl("WdGqhrVUJog"))).toBe(
      "/api/video-thumbnail?id=WdGqhrVUJog&size=small"
    );
  });

  it("laat een poster die een redacteur opgaf ongemoeid", () => {
    expect(smallVideoThumbnailUrl("https://example.com/poster.jpg")).toBe("https://example.com/poster.jpg");
  });
});
