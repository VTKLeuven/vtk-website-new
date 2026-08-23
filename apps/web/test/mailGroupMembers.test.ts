import { describe, expect, it } from "vitest";
import {
  desiredMembers,
  normaliseEmail,
  type KiesploegMembershipRow,
  type MembershipRow,
} from "@/lib/google/members";

/**
 * Wie er in een groepsadres hoort. Dit is de regel waar de hele
 * Google-koppeling op draait, dus ze wordt hier vastgezet zonder database en
 * zonder Google.
 */

function member(
  groupId: string,
  name: string,
  googleEmail: string | null,
  role: "MEMBER" | "LEAD" = "MEMBER",
): MembershipRow {
  return { groupId, role, user: { id: `u-${name}`, name, googleEmail } };
}

const jan = member("activiteiten", "Jan", "jan.peeters@vtk.be");
const ann = member("activiteiten", "Ann", "ann.desmet@vtk.be", "LEAD");
const bob = member("groep5", "Bob", "bob.mertens@vtk.be");

describe("desiredMembers", () => {
  it("neemt de leden van elke bronpost", () => {
    const result = desiredMembers({
      sources: [
        { groupId: "activiteiten", onlyLead: false },
        { groupId: "groep5", onlyLead: false },
      ],
      memberships: [jan, ann, bob],
      extras: [],
    });
    expect(result.emails).toEqual([
      "ann.desmet@vtk.be",
      "bob.mertens@vtk.be",
      "jan.peeters@vtk.be",
    ]);
    expect(result.unlinked).toEqual([]);
  });

  it("laat een post buiten de lijst wanneer ze geen bron is", () => {
    const result = desiredMembers({
      sources: [{ groupId: "activiteiten", onlyLead: false }],
      memberships: [jan, bob],
      extras: [],
    });
    expect(result.emails).toEqual(["jan.peeters@vtk.be"]);
  });

  it("neemt bij onlyLead enkel de verantwoordelijke", () => {
    const result = desiredMembers({
      sources: [{ groupId: "activiteiten", onlyLead: true }],
      memberships: [jan, ann],
      extras: [],
    });
    expect(result.emails).toEqual(["ann.desmet@vtk.be"]);
  });

  it("laat de ruimste bron winnen wanneer een post twee keer staat", () => {
    const result = desiredMembers({
      sources: [
        { groupId: "activiteiten", onlyLead: true },
        { groupId: "activiteiten", onlyLead: false },
      ],
      memberships: [jan, ann],
      extras: [],
    });
    expect(result.emails).toEqual(["ann.desmet@vtk.be", "jan.peeters@vtk.be"]);
  });

  it("meldt leden zonder gekoppeld adres in plaats van ze stil over te slaan", () => {
    const result = desiredMembers({
      sources: [{ groupId: "activiteiten", onlyLead: false }],
      memberships: [jan, member("activiteiten", "Zoe", null)],
      extras: [],
    });
    expect(result.emails).toEqual(["jan.peeters@vtk.be"]);
    expect(result.unlinked).toEqual([{ id: "u-Zoe", name: "Zoe" }]);
  });

  it("voegt losse adressen toe, ook van buiten het domein", () => {
    const result = desiredMembers({
      sources: [{ groupId: "activiteiten", onlyLead: false }],
      memberships: [jan],
      extras: [{ email: "oudlid@gmail.com", kind: "INCLUDE" }],
    });
    expect(result.emails).toEqual(["jan.peeters@vtk.be", "oudlid@gmail.com"]);
  });

  it("laat een uitsluiting winnen van de post en van een los adres", () => {
    const result = desiredMembers({
      sources: [{ groupId: "activiteiten", onlyLead: false }],
      memberships: [jan, ann],
      extras: [
        { email: "JAN.PEETERS@vtk.be", kind: "EXCLUDE" },
        { email: "extern@example.com", kind: "INCLUDE" },
        { email: "extern@example.com", kind: "EXCLUDE" },
      ],
    });
    expect(result.emails).toEqual(["ann.desmet@vtk.be"]);
  });

  it("ontdubbelt iemand die in twee bronposten zit", () => {
    const result = desiredMembers({
      sources: [
        { groupId: "activiteiten", onlyLead: false },
        { groupId: "groep5", onlyLead: false },
      ],
      memberships: [jan, { ...jan, groupId: "groep5" }],
      extras: [],
    });
    expect(result.emails).toEqual(["jan.peeters@vtk.be"]);
  });

  it("geeft een lege lijst wanneer een post dit werkingsjaar nog leeg is", () => {
    // Dit is precies wat er op 15 juli gebeurt: de memberships van vorig jaar
    // tellen niet mee, dus de lijst loopt leeg tot het nieuwe praesidium
    // ingevoerd is. De sync hoort dat gewoon door te zetten.
    const result = desiredMembers({
      sources: [{ groupId: "activiteiten", onlyLead: false }],
      memberships: [],
      extras: [],
    });
    expect(result.emails).toEqual([]);
  });
});

describe("normaliseEmail", () => {
  it("maakt adressen vergelijkbaar", () => {
    expect(normaliseEmail("  Jan.Peeters@VTK.be ")).toBe("jan.peeters@vtk.be");
  });
});

/** Een kiesploeg is een tweede soort bron, met eigen posten. */
function kiesploegMember(
  kiesploegId: string,
  postId: string | null,
  name: string,
  role: "MEMBER" | "LEAD" = "MEMBER",
): KiesploegMembershipRow {
  return {
    kiesploegId,
    postId,
    role,
    user: { id: `k-${name}`, name, googleEmail: `${name.toLowerCase()}@vtk.be` },
  };
}

describe("desiredMembers met een kiesploeg", () => {
  const marketing = kiesploegMember("kp", "post-marketing", "Mia");
  const g5 = kiesploegMember("kp", "post-g5", "Gus");
  const zonderPost = kiesploegMember("kp", null, "Noa");

  it("neemt de hele ploeg bij een kiesploegbron", () => {
    const result = desiredMembers({
      sources: [{ kiesploegId: "kp", onlyLead: false }],
      memberships: [],
      kiesploegMemberships: [marketing, g5, zonderPost],
      extras: [],
    });
    expect(result.emails).toEqual(["gus@vtk.be", "mia@vtk.be", "noa@vtk.be"]);
  });

  it("neemt bij een postbron enkel die post", () => {
    const result = desiredMembers({
      sources: [{ kiesploegPostId: "post-marketing", onlyLead: false }],
      memberships: [],
      kiesploegMemberships: [marketing, g5, zonderPost],
      extras: [],
    });
    expect(result.emails).toEqual(["mia@vtk.be"]);
  });

  it("zet de g5 erbij wanneer die als tweede bron staat", () => {
    // Zo maakt `createKiesploegListsAction` de lijsten: de post plus de g5, als
    // twee zichtbare rijen en niet als verstopte regel in de sync.
    const result = desiredMembers({
      sources: [
        { kiesploegPostId: "post-marketing", onlyLead: false },
        { kiesploegPostId: "post-g5", onlyLead: false },
      ],
      memberships: [],
      kiesploegMemberships: [marketing, g5, zonderPost],
      extras: [],
    });
    expect(result.emails).toEqual(["gus@vtk.be", "mia@vtk.be"]);
  });

  it("laat een lid zonder post buiten de postlijsten", () => {
    const result = desiredMembers({
      sources: [{ kiesploegPostId: "post-marketing", onlyLead: false }],
      memberships: [],
      kiesploegMemberships: [zonderPost],
      extras: [],
    });
    expect(result.emails).toEqual([]);
  });

  it("combineert een gewone post met een kiesploegpost", () => {
    const result = desiredMembers({
      sources: [
        { groupId: "activiteiten", onlyLead: false },
        { kiesploegPostId: "post-marketing", onlyLead: false },
      ],
      memberships: [jan],
      kiesploegMemberships: [marketing],
      extras: [],
    });
    expect(result.emails).toEqual(["jan.peeters@vtk.be", "mia@vtk.be"]);
  });
});
