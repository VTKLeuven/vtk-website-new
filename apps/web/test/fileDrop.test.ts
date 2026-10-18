import { describe, expect, it } from "vitest";
import { matchesAccept, pickDroppedFiles } from "@/lib/fileDrop";

const photo = { name: "Affiche.JPG", type: "image/jpeg" };
const pdf = { name: "magazine.pdf", type: "application/pdf" };
// Een PDF zonder MIME-type, zoals sommige systemen hem doorgeven.
const untypedPdf = { name: "Contract.PDF", type: "" };

describe("matchesAccept", () => {
  it("laat alles door zonder accept", () => {
    expect(matchesAccept(pdf, undefined)).toBe(true);
    expect(matchesAccept(pdf, " ")).toBe(true);
  });

  it("leest type/* als een familie", () => {
    expect(matchesAccept(photo, "image/*")).toBe(true);
    expect(matchesAccept(pdf, "image/*")).toBe(false);
  });

  it("leest extensies en volledige types, los van hoofdletters", () => {
    expect(matchesAccept(untypedPdf, "application/pdf,.pdf")).toBe(true);
    expect(matchesAccept(pdf, "application/pdf")).toBe(true);
    expect(matchesAccept(photo, "application/pdf,.pdf")).toBe(false);
    expect(matchesAccept(photo, ".png, .jpg")).toBe(true);
  });
});

describe("pickDroppedFiles", () => {
  it("weigert meer dan één bestand op een enkelvoudig veld", () => {
    expect(pickDroppedFiles([photo, photo], { accept: "image/*" })).toEqual({
      ok: false,
      reason: "multiple",
    });
  });

  it("neemt alles of niets: één verkeerd bestand weigert de hele drop", () => {
    expect(pickDroppedFiles([photo, pdf], { accept: "image/*", multiple: true })).toEqual({
      ok: false,
      reason: "type",
    });
  });

  it("geeft de bestanden terug wanneer ze passen", () => {
    expect(pickDroppedFiles([photo], { accept: "image/*" })).toEqual({ ok: true, files: [photo] });
    expect(pickDroppedFiles([pdf, untypedPdf], { accept: ".pdf", multiple: true })).toEqual({
      ok: true,
      files: [pdf, untypedPdf],
    });
  });
});
