import { describe, expect, it } from "vitest";
import {
  attendeeAccount,
  attendeeGroup,
  indexAttendeeAccounts,
  parseAttendeeGroup,
  type AttendeeAccount,
  type AttendeeGroupItem,
} from "@/lib/ticketing/attendeeGroups";

function account(overrides: Partial<AttendeeAccount> = {}): AttendeeAccount {
  return {
    id: "user-1",
    email: "lid@vtk.be",
    rNumber: "r0123456",
    praesidium: false,
    honorary: false,
    member: false,
    ...overrides,
  };
}

function item(overrides: Partial<AttendeeGroupItem> = {}): AttendeeGroupItem {
  return {
    attendeeName: "Jan Peeters",
    attendeeEmail: null,
    rNumber: null,
    honoraryPrice: false,
    order: { buyerUserId: "buyer", buyerName: "Koper" },
    ...overrides,
  };
}

function groupOf(ticket: AttendeeGroupItem, accounts: AttendeeAccount[]) {
  return attendeeGroup(ticket, attendeeAccount(ticket, indexAttendeeAccounts(accounts)));
}

describe("de groep van een deelnemer", () => {
  it("vindt het account langs het e-mailadres, los van hoofdletters", () => {
    expect(groupOf(item({ attendeeEmail: "LID@vtk.be" }), [account({ member: true })])).toBe("MEMBER");
  });

  it("vindt het account langs het r-nummer van de kaartcheck-in", () => {
    expect(groupOf(item({ rNumber: "R0123456" }), [account({ praesidium: true })])).toBe("PRAESIDIUM");
  });

  it("ziet zonder e-mailadres het ticket van de koper zelf aan zijn naam", () => {
    const buyer = account({ id: "buyer", email: "koper@vtk.be", honorary: true });
    const own = item({ attendeeName: " jan  PEETERS", order: { buyerUserId: "buyer", buyerName: "Jan Peeters" } });
    const friend = item({ attendeeName: "Een Vriend", order: { buyerUserId: "buyer", buyerName: "Jan Peeters" } });
    expect(groupOf(own, [buyer])).toBe("HONORARY");
    // Een lid dat voor vrienden koopt, brengt geen leden mee.
    expect(groupOf(friend, [buyer])).toBe("NON_MEMBER");
  });

  it("laat een eigen e-mailadres beslissen, ook als de naam die van de koper is", () => {
    const buyer = account({ id: "buyer", email: "koper@vtk.be", member: true });
    const ticket = item({
      attendeeName: "Jan Peeters",
      attendeeEmail: "iemand@example.com",
      order: { buyerUserId: "buyer", buyerName: "Jan Peeters" },
    });
    expect(groupOf(ticket, [buyer])).toBe("NON_MEMBER");
  });

  it("geeft voorrang aan praesidium, dan erelid, dan lid", () => {
    const all = account({ praesidium: true, honorary: true, member: true });
    expect(groupOf(item({ attendeeEmail: "lid@vtk.be" }), [all])).toBe("PRAESIDIUM");
    const honoraryMember = account({ honorary: true, member: true });
    expect(groupOf(item({ attendeeEmail: "lid@vtk.be" }), [honoraryMember])).toBe("HONORARY");
  });

  it("telt een ticket aan de ereledenprijs als erelid, ook zonder account", () => {
    expect(groupOf(item({ honoraryPrice: true }), [])).toBe("HONORARY");
  });

  it("aanvaardt enkel de vier groepen als filter", () => {
    expect(parseAttendeeGroup("HONORARY")).toBe("HONORARY");
    expect(parseAttendeeGroup("honorary")).toBeNull();
    expect(parseAttendeeGroup(undefined)).toBeNull();
  });
});
