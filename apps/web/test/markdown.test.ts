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
import { isVideoUrl } from "@/components/ui/InlineVideoPlayer";

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
