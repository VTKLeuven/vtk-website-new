import { describe, expect, it } from "vitest";
import { readImageField, resolveImageKey, type ImageFieldValue } from "@/lib/imageField";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

/** `resolveImageKey` weigert "invalid"; die tak hoort bij de aanroeper. */
function resolved(value: ImageFieldValue, existing: string | null): string | null {
  if (value.kind === "invalid") throw new Error("unexpected invalid");
  return resolveImageKey(value, existing);
}

describe("readImageField", () => {
  it("neemt een geüploade key over", () => {
    expect(readImageField(form({ imageKey: "images/abc.jpg" }))).toEqual({
      kind: "set",
      key: "images/abc.jpg",
    });
  });

  it("wist enkel wanneer de gebruiker expliciet verwijderde", () => {
    expect(readImageField(form({ imageKey: "", imageKey__cleared: "1" }))).toEqual({
      kind: "clear",
    });
  });

  it("laat een lege key zonder wis-vlag ongemoeid", () => {
    // Dit is het geval van een upload die nog bezig was of gefaald is.
    expect(readImageField(form({ imageKey: "" }))).toEqual({ kind: "keep" });
    expect(readImageField(form({}))).toEqual({ kind: "keep" });
  });

  it("weigert een key buiten images/", () => {
    expect(readImageField(form({ imageKey: "../../etc/passwd" }))).toEqual({ kind: "invalid" });
    expect(readImageField(form({ imageKey: "pdfs/geheim.pdf" }))).toEqual({ kind: "invalid" });
  });

  it("leest een veld onder een eigen naam", () => {
    const fd = form({ posterKey: "images/p.jpg" });
    expect(readImageField(fd, "posterKey")).toEqual({ kind: "set", key: "images/p.jpg" });
  });
});

describe("resolveImageKey", () => {
  it("bewaart de bestaande foto bij een half verzonden formulier", () => {
    // De regressie: opslaan tijdens een lopende upload stuurde een lege key mee,
    // die de bestaande foto wiste en het object uit storage verwijderde.
    const value = readImageField(form({ imageKey: "" }));
    expect(resolved(value, "images/bestaand.jpg")).toBe("images/bestaand.jpg");
  });

  it("vervangt de foto na een geslaagde upload", () => {
    const value = readImageField(form({ imageKey: "images/nieuw.jpg" }));
    expect(resolved(value, "images/oud.jpg")).toBe("images/nieuw.jpg");
  });

  it("wist de foto na een klik op de prullenbak", () => {
    const value = readImageField(form({ imageKey: "", imageKey__cleared: "1" }));
    expect(resolved(value, "images/oud.jpg")).toBeNull();
  });

  it("laat een nieuw item zonder foto null", () => {
    expect(resolved(readImageField(form({ imageKey: "" })), null)).toBeNull();
  });
});
