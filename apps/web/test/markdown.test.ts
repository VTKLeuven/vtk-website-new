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
});
