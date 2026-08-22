import { describe, expect, it } from "vitest";
import { parseCredential, verifyOffline } from "@/components/ticketing/scanner/offline";
import type { ScannerManifest } from "@/components/ticketing/scanner/types";

const manifest: ScannerManifest = {
  complete: true,
  generatedAt: "2026-08-07T18:00:00.000Z",
  ticketCount: 3,
  tickets: [
    { code: "AAAAAAAAAAAA", version: 1, checkedIn: false, name: "Jonas", type: "Standaard", typeColor: "navy" },
    { code: "BBBBBBBBBBBB", version: 2, checkedIn: false, name: "Mila", type: "Vroegboek", typeColor: "amber" },
    { code: "CCCCCCCCCCCC", version: 1, checkedIn: true, name: "Sam", type: "Standaard", typeColor: "navy" },
  ],
};

/** Zoals lib/ticketing/crypto.ts hem maakt: prefix.publicId.versie.handtekening. */
function credential(code: string, version: number, signature = "sig") {
  return `vtkt.${code}.${version}.${signature}`;
}

describe("parseCredential", () => {
  it("haalt code en versie uit een volledige credential", () => {
    expect(parseCredential(credential("AAAAAAAAAAAA", 3))).toEqual({
      code: "AAAAAAAAAAAA",
      version: 3,
    });
  });

  it("laat een handmatig ingetikte code door zonder versie", () => {
    expect(parseCredential("AAAAAAAAAAAA")).toEqual({ code: "AAAAAAAAAAAA", version: 0 });
  });

  it("weigert wat geen ticketcode kan zijn", () => {
    expect(parseCredential("kort")).toBeNull();
    expect(parseCredential("https://example.com/iets")).toBeNull();
  });
});

describe("verifyOffline", () => {
  const geen = () => new Set<string>();

  it("aanvaardt een geldig, nog niet gescand ticket", () => {
    const verdict = verifyOffline(manifest, credential("AAAAAAAAAAAA", 1), geen());
    expect(verdict.kind).toBe("accepted");
    expect(verdict.kind === "accepted" && verdict.entry.name).toBe("Jonas");
  });

  it("weigert een code die niet in het manifest staat", () => {
    const verdict = verifyOffline(manifest, credential("ZZZZZZZZZZZZ", 1), geen());
    expect(verdict).toEqual({ kind: "rejected", reason: "unknown" });
  });

  it("weigert een verouderde versie, want dat is een herblokkeerd ticket", () => {
    const verdict = verifyOffline(manifest, credential("BBBBBBBBBBBB", 1), geen());
    expect(verdict).toEqual({ kind: "rejected", reason: "version" });
  });

  it("herkent iemand die volgens het manifest al binnen was", () => {
    const verdict = verifyOffline(manifest, credential("CCCCCCCCCCCC", 1), geen());
    expect(verdict.kind).toBe("duplicate");
  });

  it("herkent een dubbele scan van deze sessie zelf", () => {
    const gescand = new Set(["AAAAAAAAAAAA"]);
    const verdict = verifyOffline(manifest, credential("AAAAAAAAAAAA", 1), gescand);
    expect(verdict.kind).toBe("duplicate");
  });

  it("laat een handmatig ingetikte code toe zonder versiecontrole", () => {
    // Versie 0 = geen versie bekend; de server doet de volledige controle bij het
    // synchroniseren, dus hier niet onterecht weigeren.
    const verdict = verifyOffline(manifest, "BBBBBBBBBBBB", geen());
    expect(verdict.kind).toBe("accepted");
  });

  it("weigert onleesbare invoer", () => {
    expect(verifyOffline(manifest, "?!", geen())).toEqual({
      kind: "rejected",
      reason: "unreadable",
    });
  });
});
