import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CARD_HASH_LENGTH, cardHashInBrowser, cardHashInput } from "@/lib/ticketing/cardHash";

/** Zoals de server hem maakt in `scannerBootstrap`. */
function serverHash(salt: string, card: string) {
  return createHash("sha256")
    .update(cardHashInput(salt, card))
    .digest("hex")
    .slice(0, CARD_HASH_LENGTH);
}

describe("cardHashInput", () => {
  it("neemt de salt mee, zodat twee manifesten niet aan elkaar te leggen zijn", () => {
    expect(cardHashInput("zout-a", "04AABB;1")).not.toEqual(cardHashInput("zout-b", "04AABB;1"));
  });

  it("negeert de newline die de lezer achteraan tikt", () => {
    expect(cardHashInput("zout", "04AABB;1\r\n")).toEqual(cardHashInput("zout", "04AABB;1"));
  });

  it("negeert het verschil tussen hoofd- en kleine letters in het kaartnummer", () => {
    expect(cardHashInput("zout", "04aabb;1")).toEqual(cardHashInput("zout", "04AABB;1"));
  });

  it("houdt twee verschillende kaarten uit elkaar", () => {
    expect(cardHashInput("zout", "04AABB;1")).not.toEqual(cardHashInput("zout", "04AABC;1"));
  });
});

describe("cardHashInBrowser", () => {
  // De hele offline-kaartcheck-in hangt hierop: de server hasht bij het bouwen
  // van het manifest, de scanner hasht aan de deur, en als die twee uit elkaar
  // lopen herkent het toestel geen enkele kaart meer, zonder één foutmelding.
  it("geeft exact wat de server in het manifest zet", async () => {
    const salt = "0123456789abcdef";
    await expect(cardHashInBrowser(salt, "04AABBCCDDEE;1")).resolves.toEqual(
      serverHash(salt, "04AABBCCDDEE;1"),
    );
  });

  it("blijft op de afgesproken lengte", async () => {
    await expect(cardHashInBrowser("zout", "04AABB;1")).resolves.toHaveLength(CARD_HASH_LENGTH);
  });

  it("normaliseert net als de serverkant", async () => {
    const salt = "zout";
    const [getikt, netjes] = await Promise.all([
      cardHashInBrowser(salt, " 04aabb;1\n"),
      cardHashInBrowser(salt, "04AABB;1"),
    ]);
    expect(getikt).toEqual(netjes);
  });
});
