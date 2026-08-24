import { describe, expect, it } from "vitest";
import {
  generatePassword,
  normaliseNamePart,
  proposeAddress,
  renderAddress,
  renderTemplate,
} from "@/lib/google/addresses";

describe("normaliseNamePart", () => {
  it("haalt accenten, spaties en leestekens weg", () => {
    expect(normaliseNamePart("Noël")).toBe("noel");
    expect(normaliseNamePart("Van den Broeck")).toBe("vandenbroeck");
    expect(normaliseNamePart("D'Hondt")).toBe("dhondt");
    expect(normaliseNamePart("Jean-Pierre")).toBe("jeanpierre");
  });
});

describe("renderTemplate", () => {
  it("vult de placeholders in", () => {
    expect(
      renderTemplate("kiesploeg{code}.{voornaam}.{achternaam}", {
        code: "2027",
        voornaam: "Jan",
        achternaam: "Peeters",
      }),
    ).toBe("kiesploeg2027.jan.peeters");
  });

  it("laat een placeholder staan waarvoor niets meegegeven is", () => {
    // Zichtbaar fout is beter dan stil een half adres maken.
    expect(renderTemplate("{post}.{code}", { code: "2027" })).toBe("{post}.2027");
  });
});

describe("renderAddress", () => {
  it("plakt het domein eraan", () => {
    expect(
      renderAddress("{voornaam}.{achternaam}", { voornaam: "Ann", achternaam: "De Smet" }, "vtk.be"),
    ).toBe("ann.desmet@vtk.be");
  });

  it("ruimt dubbele en hangende punten op", () => {
    // Een leeg naamdeel mag geen "jan..peeters@" of ".jan@" opleveren.
    expect(
      renderAddress("{voornaam}.{achternaam}", { voornaam: "", achternaam: "Peeters" }, "vtk.be"),
    ).toBe("peeters@vtk.be");
  });
});

describe("proposeAddress", () => {
  const vars = { voornaam: "Jan", achternaam: "Peeters" };

  it("neemt het gewone adres wanneer het vrij is", () => {
    expect(proposeAddress("{voornaam}.{achternaam}", vars, "vtk.be", new Set())).toBe(
      "jan.peeters@vtk.be",
    );
  });

  it("wijkt uit bij een naamgenoot", () => {
    const taken = new Set(["jan.peeters@vtk.be"]);
    expect(proposeAddress("{voornaam}.{achternaam}", vars, "vtk.be", taken)).toBe(
      "jan.peeters2@vtk.be",
    );
  });

  it("blijft uitwijken tot er een vrij adres is", () => {
    const taken = new Set(["jan.peeters@vtk.be", "jan.peeters2@vtk.be"]);
    expect(proposeAddress("{voornaam}.{achternaam}", vars, "vtk.be", taken)).toBe(
      "jan.peeters3@vtk.be",
    );
  });
});

describe("generatePassword", () => {
  it("bevat geen tekens die op elkaar lijken", () => {
    const password = generatePassword();
    expect(password).toHaveLength(16);
    expect(password).not.toMatch(/[lIO01]/);
  });
});
