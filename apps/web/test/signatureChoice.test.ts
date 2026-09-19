import { describe, expect, it } from "vitest";
import { pickLocal, signatureName } from "@/lib/signatureProfile";

const self = { text: "JASPER VAN ELSACKER\nVTK IT 26-27", html: "<table>ik</table>" };
const post = { text: "VTK ONDERWIJS\nVTK 26-27", html: "<table>post</table>" };

describe("signatureName", () => {
  it("neemt de naam bovenaan, om de keuze te benoemen", () => {
    expect(signatureName(self)).toBe("JASPER VAN ELSACKER");
    expect(signatureName(post)).toBe("VTK ONDERWIJS");
  });

  it("geeft niets terug voor een lege ondertekening", () => {
    expect(signatureName({ text: "", html: "" })).toBe("");
  });
});

describe("pickLocal", () => {
  // De keuze staat nergens opgeslagen: de opgestelde tekst draagt ze zelf. Zo
  // hoeft een mail die dagen blijft wachten geen extra kolom.
  it("herkent een mail die met de post ondertekend is", () => {
    const body = `Geachte professor,\n\nMet vriendelijke groet,\n${post.text}`;
    expect(pickLocal(body, self, post)).toBe(post);
  });

  it("houdt de persoon wanneer die eronder staat", () => {
    const body = `Geachte professor,\n\nMet vriendelijke groet,\n${self.text}`;
    expect(pickLocal(body, self, post)).toBe(self);
  });

  it("valt terug op de persoon wanneer geen van beide erin staat", () => {
    expect(pickLocal("Een mail zonder ondertekening.", self, post)).toBe(self);
  });
});
