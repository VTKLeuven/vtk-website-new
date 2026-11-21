import { describe, expect, it } from "vitest";
import { mailPreviewGroups, mailPreviews } from "@/lib/mailPreviews";

/**
 * Het register achter /admin/it/flows. Elke rij roept de echte template aan;
 * hier enkel wat voor elke rij moet gelden, zodat een nieuwe mail die het
 * register breekt (een dubbele id, een lege tekst) niet pas op het scherm
 * opvalt.
 */
describe("mailPreviews", () => {
  it("geeft elke mail een unieke id, een onderwerp en een tekst", () => {
    const mails = mailPreviews();
    const ids = mails.map((mail) => mail.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const mail of mails) {
      expect(mail.subject.trim(), mail.id).not.toBe("");
      expect(mail.text.trim(), mail.id).not.toBe("");
    }
  });

  it("toont de mails van de uitleendienst, uit de echte templates", () => {
    const group = mailPreviewGroups().find((entry) => entry.id === "uitleendienst");
    expect(group?.mails.map((mail) => mail.id)).toEqual([
      "uitleen-materiaal-beslist",
      "uitleen-materiaal-afgewezen",
      "uitleen-rit-beslist",
      "uitleen-rit-doorgegeven",
      "uitleen-rit-geannuleerd-chauffeur",
      "uitleen-team-nieuw",
      "uitleen-team-geannuleerd",
    ]);
    const driver = group!.mails.find((mail) => mail.id === "uitleen-rit-geannuleerd-chauffeur")!;
    expect(driver.subject).toBe("VTK Logistiek: rit geannuleerd, Tafels naar de voorbeeldzaal (za 3 okt. 2026)");
    // Geen eigen kopie van de tekst: de logistiekmails staan buiten het maillogboek.
    expect(driver.source).toBeUndefined();
    expect(driver.file).toBe("packages/mail/src/logistiek.ts");
  });
});
