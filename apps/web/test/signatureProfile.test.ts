import { describe, expect, it } from "vitest";
import {
  resolveSignatureData,
  signatureRolePresets,
  type SignatureMembership,
  type StoredSignature,
} from "@/lib/signatureProfile";
import { generateSignaturePlainText } from "@/lib/signature";

const user = {
  name: "Jan Van den Broeck",
  firstName: "Jan",
  lastName: "Van den Broeck",
  email: "jan.vandenbroeck@student.kuleuven.be",
};

const empty: StoredSignature = {
  signatureName: null,
  signatureRoleTitle: null,
  signatureEmail: null,
  signaturePhone: null,
};

const onderwijs: SignatureMembership = {
  groupNameNl: "Onderwijs",
  groupNameEn: "Education",
  titleNl: null,
  titleEn: null,
  yearCode: "26-27",
};

describe("signatureRolePresets", () => {
  it("zet VTK voor de naam van de post", () => {
    const presets = signatureRolePresets([onderwijs], "nl", "26-27");
    expect(presets[0]).toEqual({ label: "VTK Onderwijs 26-27 (26-27)", value: "VTK Onderwijs 26-27" });
  });

  it("laat een titel die al met VTK begint ongemoeid", () => {
    const presets = signatureRolePresets(
      [{ ...onderwijs, titleNl: "VTK Onderwijs" }],
      "nl",
      "26-27",
    );
    expect(presets[0].value).toBe("VTK Onderwijs");
  });

  it("volgt de taal van het scherm", () => {
    expect(signatureRolePresets([onderwijs], "en", "26-27")[0].value).toBe("VTK Education 26-27");
  });

  it("geeft zonder lidmaatschap nog altijd de kring terug", () => {
    // Zonder lidmaatschap is er geen jaar om achter te zetten, dus draagt de
    // terugval geen suffix; dat is ook hoe het handtekeningscherm het toonde.
    expect(signatureRolePresets([], "nl", "26-27")).toEqual([
      { label: "VTK 26-27", value: "VTK 26-27" },
    ]);
  });

  it("herhaalt een functie niet wanneer twee lidmaatschappen hetzelfde opleveren", () => {
    const presets = signatureRolePresets([onderwijs, onderwijs], "nl", "26-27");
    expect(presets).toHaveLength(1);
  });
});

describe("resolveSignatureData", () => {
  it("leidt alles af wanneer het lid niets invulde", () => {
    const data = resolveSignatureData(user, empty, [onderwijs], "nl", "26-27");
    expect(data).toEqual({
      fullName: "Jan Van den Broeck",
      roleTitle: "VTK Onderwijs 26-27",
      emailAddress: "jan.vandenbroeck@vtk.be",
      phoneDisplay: "",
    });
  });

  it("laat elk ingevuld veld voorgaan op het afgeleide", () => {
    const data = resolveSignatureData(
      user,
      {
        signatureName: "Jan V.",
        signatureRoleTitle: "VTK Onderwijs",
        signatureEmail: "onderwijs@vtk.be",
        signaturePhone: "+32 470 12 34 56",
      },
      [onderwijs],
      "nl",
      "26-27",
    );
    expect(data.fullName).toBe("Jan V.");
    expect(data.roleTitle).toBe("VTK Onderwijs");
    expect(data.emailAddress).toBe("onderwijs@vtk.be");
    expect(data.phoneDisplay).toBe("+32 470 12 34 56");
  });

  it("vult per veld aan: enkel een nummer laat naam en functie afgeleid", () => {
    const data = resolveSignatureData(
      user,
      { ...empty, signaturePhone: "+32 470 12 34 56" },
      [onderwijs],
      "nl",
      "26-27",
    );
    expect(data.fullName).toBe("Jan Van den Broeck");
    expect(data.roleTitle).toBe("VTK Onderwijs 26-27");
    expect(data.phoneDisplay).toBe("+32 470 12 34 56");
  });

  it("behandelt een veld met enkel spaties als niet ingevuld", () => {
    const data = resolveSignatureData(user, { ...empty, signatureName: "   " }, [], "nl", "26-27");
    expect(data.fullName).toBe("Jan Van den Broeck");
  });

  it("houdt een @vtk.be-adres dat het lid al heeft", () => {
    const data = resolveSignatureData(
      { ...user, email: "jan@vtk.be" },
      empty,
      [onderwijs],
      "nl",
      "26-27",
    );
    expect(data.emailAddress).toBe("jan@vtk.be");
  });
});

describe("de ondertekening onder een mail", () => {
  it("laat de nummerregel weg wanneer er geen nummer is", () => {
    const data = resolveSignatureData(user, empty, [onderwijs], "nl", "26-27");
    const text = generateSignaturePlainText(data);
    expect(text).not.toContain("M:");
    // De generator zet de naam in kapitalen; dat is de huisstijl en niet iets
    // wat deze laag aanpast.
    expect(text).toContain("JAN VAN DEN BROECK");
    expect(text).toContain("E: jan.vandenbroeck@vtk.be");
  });

  it("zet het nummer erbij wanneer het lid er een invulde", () => {
    const data = resolveSignatureData(
      user,
      { ...empty, signaturePhone: "+32 470 12 34 56" },
      [onderwijs],
      "nl",
      "26-27",
    );
    expect(generateSignaturePlainText(data)).toContain("M: +32 470 12 34 56");
  });
});
