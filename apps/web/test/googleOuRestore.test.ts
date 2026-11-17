import { describe, expect, it } from "vitest";
import { parseOuMoves, planOuRestore } from "@/lib/google/ouRestore";

/**
 * Het logboek van de Admin console teruglezen: wie stond waar voor de sync van
 * 16 november 2026 iedereen naar "/" verhuisde.
 */

// Zoals een rij uit de tabel gekopieerd wordt: tabs tussen de kolommen.
const copied = [
  "2026-11-16T15:01:26+01:00\tOrganisatie-eenheid gebruiker gewijzigd\tyoran.weustenberg@vtk.be is verplaatst van /Praesidium naar /\tyoutrack@vtk.be\t167.235.138.237",
  "2026-11-16T15:01:24+01:00\tOrganisatie-eenheid gebruiker gewijzigd\tyana.possemiers@vtk.be is verplaatst van /Oude Zakken naar /\tyoutrack@vtk.be\t167.235.138.237",
  "2026-11-16T14:58:59+01:00\tOrganisatie-eenheid gebruiker gewijzigd\tjoas.haest@vtk.be is verplaatst van /Kiesploeg Delta naar /\tyoutrack@vtk.be\t167.235.138.237",
].join("\n");

describe("parseOuMoves", () => {
  it("leest gekopieerde rijen, ook OU's met een spatie", () => {
    expect(parseOuMoves(copied)).toEqual([
      { email: "yoran.weustenberg@vtk.be", from: "/Praesidium", to: "/", at: "2026-11-16T15:01:26+01:00" },
      { email: "yana.possemiers@vtk.be", from: "/Oude Zakken", to: "/", at: "2026-11-16T15:01:24+01:00" },
      { email: "joas.haest@vtk.be", from: "/Kiesploeg Delta", to: "/", at: "2026-11-16T14:58:59+01:00" },
    ]);
  });

  it("leest een CSV-export met aanhalingstekens", () => {
    const csv = `"2026-11-16T15:00:14+01:00","Organisatie-eenheid gebruiker gewijzigd","revue.rares.muraru@vtk.be is verplaatst van /Revue naar /","youtrack@vtk.be","167.235.138.237"`;
    expect(parseOuMoves(csv)).toEqual([
      { email: "revue.rares.muraru@vtk.be", from: "/Revue", to: "/", at: "2026-11-16T15:00:14+01:00" },
    ]);
  });

  it("leest een geneste OU en de Engelse tekst", () => {
    expect(parseOuMoves("a@vtk.be was moved from /Werkgroepen/Statix to /")).toEqual([
      { email: "a@vtk.be", from: "/Werkgroepen/Statix", to: "/", at: null },
    ]);
  });

  it("negeert andere regels uit het logboek", () => {
    expect(parseOuMoves("2026-11-16T15:16:56+01:00\tGroepslid verwijderd\tGebruiker x@vtk.be is verwijderd uit groep")).toEqual([]);
  });
});

describe("planOuRestore", () => {
  it("zet elk account terug waar het voor de eerste verhuizing stond", () => {
    expect(planOuRestore(parseOuMoves(copied))).toEqual([
      { email: "joas.haest@vtk.be", restoreTo: "/Kiesploeg Delta", movedTo: "/" },
      { email: "yana.possemiers@vtk.be", restoreTo: "/Oude Zakken", movedTo: "/" },
      { email: "yoran.weustenberg@vtk.be", restoreTo: "/Praesidium", movedTo: "/" },
    ]);
  });

  it("neemt bij twee verhuizingen de oudste van en de jongste naar", () => {
    const text = [
      "2026-11-16T16:00:00+01:00 a@vtk.be is verplaatst van /Tijdelijk naar /",
      "2026-11-16T15:00:00+01:00 a@vtk.be is verplaatst van /Praesidium naar /Tijdelijk",
    ].join("\n");
    expect(planOuRestore(parseOuMoves(text))).toEqual([{ email: "a@vtk.be", restoreTo: "/Praesidium", movedTo: "/" }]);
  });

  it("zonder tijdstippen geldt de volgorde van het logboek (nieuwste boven)", () => {
    const text = ["a@vtk.be is verplaatst van /Tijdelijk naar /", "a@vtk.be is verplaatst van /Praesidium naar /Tijdelijk"].join("\n");
    expect(planOuRestore(parseOuMoves(text))).toEqual([{ email: "a@vtk.be", restoreTo: "/Praesidium", movedTo: "/" }]);
  });

  it("laat weg wie al terug is waar het stond", () => {
    const text = [
      "2026-11-17T09:00:00+01:00 a@vtk.be is verplaatst van / naar /Praesidium",
      "2026-11-16T15:00:00+01:00 a@vtk.be is verplaatst van /Praesidium naar /",
    ].join("\n");
    expect(planOuRestore(parseOuMoves(text))).toEqual([]);
  });
});
