import { describe, expect, it } from "vitest";
import { postAddress } from "@/lib/postAddress";

describe("postAddress", () => {
  it("maakt van de postcode het groepsadres", () => {
    expect(postAddress("ACTIVITEITEN")).toBe("activiteiten@vtk.be");
    expect(postAddress("IT")).toBe("it@vtk.be");
    expect(postAddress("THEOKOT")).toBe("theokot@vtk.be");
  });

  it("plakt geen streepje in de naam", () => {
    // Groep 5 heet als post `GROEP5`, niet `GROEP-5`: groep5@vtk.be, net als op
    // old.vtk.be. Het `slug`-veld (groep-5) is dus bewust NIET de basis.
    expect(postAddress("GROEP5")).toBe("groep5@vtk.be");
  });

  it("negeert omringende spaties", () => {
    expect(postAddress(" SPORT ")).toBe("sport@vtk.be");
  });
});
