import { describe, expect, it } from "vitest";
import { pickRecipients, type RecipientCandidate } from "@/lib/ticketing/attendeeRecipients";

const candidate = (over: Partial<RecipientCandidate>): RecipientCandidate => ({
  email: "a@example.test",
  name: "A",
  ticketTypeId: "beer",
  group: "MEMBER",
  orderId: "o1",
  ...over,
});

describe("deelnemers mailen", () => {
  const all = [
    candidate({ email: "a@example.test", ticketTypeId: "beer", group: "MEMBER" }),
    candidate({ email: "A@example.test", ticketTypeId: "water", group: "MEMBER" }),
    candidate({ email: "b@example.test", ticketTypeId: "water", group: "NON_MEMBER", orderId: "o2" }),
    candidate({ email: "c@example.test", ticketTypeId: "beer", group: "PRAESIDIUM", orderId: "o3" }),
  ];

  it("stuurt zonder keuze naar iedereen, één keer per adres", () => {
    expect(pickRecipients(all, { ticketTypeIds: [], groups: [] }).map((r) => r.email)).toEqual([
      "a@example.test",
      "b@example.test",
      "c@example.test",
    ]);
  });

  it("filtert op tickettype en op groep, en beide samen", () => {
    expect(pickRecipients(all, { ticketTypeIds: ["water"], groups: [] }).map((r) => r.email)).toEqual([
      "a@example.test",
      "b@example.test",
    ]);
    expect(pickRecipients(all, { ticketTypeIds: [], groups: ["PRAESIDIUM"] }).map((r) => r.email)).toEqual([
      "c@example.test",
    ]);
    expect(
      pickRecipients(all, { ticketTypeIds: ["beer"], groups: ["MEMBER", "NON_MEMBER"] }).map((r) => r.email),
    ).toEqual(["a@example.test"]);
  });

  it("geeft niemand terug wanneer niets past", () => {
    expect(pickRecipients(all, { ticketTypeIds: ["beer"], groups: ["HONORARY"] })).toEqual([]);
  });
});
