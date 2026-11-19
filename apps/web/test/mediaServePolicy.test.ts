import { describe, expect, it } from "vitest";
import { isInlineSafeContentType, isPublicMediaKey, uploadContentType } from "@vtk/storage";

/**
 * Wat `/api/media` (web én uitleendienst) mag serveren. Zie `serve.ts` in
 * `@vtk/storage`: een formulierbestand met `text/html` opende als pagina, en
 * bonnetjes waren zonder login op te halen wie de key kende.
 */
describe("isPublicMediaKey", () => {
  it("laat de publieke mappen door", () => {
    expect(isPublicMediaKey("images/abc.jpg")).toBe(true);
    expect(isPublicMediaKey("pdfs/abc.pdf")).toBe(true);
    expect(isPublicMediaKey("uitleen/abc.jpg")).toBe(true);
    expect(isPublicMediaKey("avatars/abc.jpg")).toBe(true);
  });

  it("weigert de private mappen", () => {
    expect(isPublicMediaKey("forms/form1/abc.pdf")).toBe(false);
    expect(isPublicMediaKey("bonnetjes/abc.jpg")).toBe(false);
    expect(isPublicMediaKey("feedback/abc.png")).toBe(false);
  });

  it("weigert lege, punt- en puntpuntsegmenten", () => {
    expect(isPublicMediaKey("")).toBe(false);
    expect(isPublicMediaKey("images/../forms/x/abc.pdf")).toBe(false);
    expect(isPublicMediaKey("./forms/x/abc.pdf")).toBe(false);
    expect(isPublicMediaKey("/forms/x/abc.pdf")).toBe(false);
    expect(isPublicMediaKey("images//abc.jpg")).toBe(false);
  });
});

describe("isInlineSafeContentType", () => {
  it("laat afbeeldingen, pdf en video inline", () => {
    expect(isInlineSafeContentType("image/jpeg")).toBe(true);
    expect(isInlineSafeContentType("Image/PNG; charset=binary")).toBe(true);
    expect(isInlineSafeContentType("application/pdf")).toBe(true);
    expect(isInlineSafeContentType("video/mp4")).toBe(true);
  });

  it("weigert alles wat als document met script kan openen", () => {
    expect(isInlineSafeContentType("text/html")).toBe(false);
    expect(isInlineSafeContentType("image/svg+xml")).toBe(false);
    expect(isInlineSafeContentType("application/xhtml+xml")).toBe(false);
    // Deze kwam door de oude denylist.
    expect(isInlineSafeContentType("application/atom+xml")).toBe(false);
    expect(isInlineSafeContentType("text/xsl")).toBe(false);
    expect(isInlineSafeContentType("application/octet-stream")).toBe(false);
    expect(isInlineSafeContentType("")).toBe(false);
    expect(isInlineSafeContentType(undefined)).toBe(false);
  });
});

describe("uploadContentType", () => {
  it("volgt de extensie, niet wat de browser opgeeft", () => {
    expect(uploadContentType("cv.pdf")).toBe("application/pdf");
    expect(uploadContentType("Foto.JPG")).toBe("image/jpeg");
    expect(uploadContentType("verslag.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("maakt van een onbekende of gevaarlijke extensie bytes", () => {
    expect(uploadContentType("pagina.html")).toBe("application/octet-stream");
    expect(uploadContentType("logo.svg")).toBe("application/octet-stream");
    expect(uploadContentType("geen-extensie")).toBe("application/octet-stream");
    expect(uploadContentType(null)).toBe("application/octet-stream");
  });
});
