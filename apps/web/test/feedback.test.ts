import { describe, expect, it } from "vitest";
import { doplFeedbackEmbedUrl, doplFeedbackFormUrl } from "@/lib/feedback";

describe("Dopl-feedbackformulier", () => {
  it("geeft taal, naam en adres mee aan de modal", () => {
    const url = new URL(
      doplFeedbackEmbedUrl("https://vtk.be", {
        locale: "nl",
        name: "Victor Christiaens",
        email: "victor@student.kuleuven.be",
      }),
    );
    expect(url.origin).toBe("https://dopl.vtk.be");
    expect(url.pathname).toBe("/f/website-feedback-nieuwe-website");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      embed: "modal",
      origin: "https://vtk.be",
      lang: "nl",
      email: "victor@student.kuleuven.be",
      name: "Victor Christiaens",
    });
  });

  it("laat de taal weg in het Engels, want dat doet Dopl al", () => {
    const url = new URL(doplFeedbackEmbedUrl("https://vtk.be", { locale: "en" }));
    expect(url.searchParams.has("lang")).toBe(false);
    expect(url.searchParams.has("email")).toBe(false);
  });

  it("opent in een nieuw tabblad met dezelfde voorinvulling, zonder embed", () => {
    const url = new URL(doplFeedbackFormUrl({ locale: "nl", email: "a+b@vtk.be", name: "Ann" }));
    expect(url.searchParams.get("embed")).toBeNull();
    expect(url.searchParams.get("email")).toBe("a+b@vtk.be");
    expect(doplFeedbackFormUrl({ locale: "en" })).toBe(
      "https://dopl.vtk.be/f/website-feedback-nieuwe-website",
    );
  });
});
