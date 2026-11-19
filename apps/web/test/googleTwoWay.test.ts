import { describe, expect, it } from "vitest";
import { planTwoWay } from "@/lib/google/twoWay";

/**
 * Wat in Google veranderde, hoort de site over te nemen in plaats van terug te
 * draaien. Aanleiding: wie in wgalumni@vtk.be leden terugzette, zag ze binnen
 * de vijf minuten weer verdwijnen.
 */
describe("planTwoWay", () => {
  it("neemt een lid dat in Google toegevoegd werd over, in plaats van het te verwijderen", () => {
    const plan = planTwoWay({ desired: ["a@vtk.be"], remote: ["a@vtk.be", "tiddo@vtk.be"], baseline: ["a@vtk.be"] });
    expect(plan.takeOver).toEqual(["tiddo@vtk.be"]);
    expect(plan.remove).toEqual([]);
    expect(plan.next).toEqual(["a@vtk.be", "tiddo@vtk.be"]);
  });

  it("haalt een lid dat in Google verwijderd werd ook uit de regel, en zet het niet terug", () => {
    const plan = planTwoWay({ desired: ["a@vtk.be", "b@vtk.be"], remote: ["a@vtk.be"], baseline: ["a@vtk.be", "b@vtk.be"] });
    expect(plan.dropped).toEqual(["b@vtk.be"]);
    expect(plan.add).toEqual([]);
    expect(plan.next).toEqual(["a@vtk.be"]);
  });

  it("zet wat op de site veranderde nog altijd door naar Google", () => {
    const plan = planTwoWay({
      desired: ["a@vtk.be", "nieuw@vtk.be"],
      remote: ["a@vtk.be", "weg@vtk.be"],
      baseline: ["a@vtk.be", "weg@vtk.be"],
    });
    expect(plan.add).toEqual(["nieuw@vtk.be"]);
    expect(plan.remove).toEqual(["weg@vtk.be"]);
    expect(plan.takeOver).toEqual([]);
    expect(plan.dropped).toEqual([]);
  });

  it("zonder onthouden lijst: wat extra in Google staat overnemen, niemand weghalen", () => {
    const plan = planTwoWay({ desired: ["a@vtk.be", "b@vtk.be"], remote: ["a@vtk.be", "extra@vtk.be"], baseline: null });
    expect(plan.takeOver).toEqual(["extra@vtk.be"]);
    expect(plan.dropped).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.add).toEqual(["b@vtk.be"]);
  });

  it("doet niets wanneer Google en de site overeenkomen", () => {
    const plan = planTwoWay({ desired: ["a@vtk.be"], remote: ["a@vtk.be"], baseline: ["a@vtk.be"] });
    expect(plan).toEqual({ takeOver: [], dropped: [], add: [], remove: [], next: ["a@vtk.be"] });
  });

  it("een lid dat de site net toevoegde en dat nog niet in Google staat, gaat erbij", () => {
    const plan = planTwoWay({ desired: ["a@vtk.be", "b@vtk.be"], remote: ["a@vtk.be"], baseline: ["a@vtk.be"] });
    expect(plan.add).toEqual(["b@vtk.be"]);
    expect(plan.dropped).toEqual([]);
  });
});
