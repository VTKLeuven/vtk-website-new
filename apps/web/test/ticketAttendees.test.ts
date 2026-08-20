import { describe, expect, it } from "vitest";
import { attendeesForQuantity, type Attendee } from "@/components/ticketing/public/TicketShop";

const viewer = { name: "Ada Lovelace", email: "ada@example.test" };

describe("ticket attendee prefill", () => {
  it("prefills the first attendee with the signed-in buyer", () => {
    expect(attendeesForQuantity({}, "standard", 2, viewer)).toEqual([
      { attendeeName: viewer.name, attendeeEmail: viewer.email, answers: {} },
      { attendeeName: "", attendeeEmail: "", answers: {} },
    ]);
  });

  it("does not prefill another ticket type when an attendee already exists", () => {
    const existing: Attendee = {
      attendeeName: viewer.name,
      attendeeEmail: viewer.email,
      answers: {},
    };
    expect(attendeesForQuantity({ standard: [existing] }, "member", 1, viewer)).toEqual([
      { attendeeName: "", attendeeEmail: "", answers: {} },
    ]);
  });

  it("preserves attendee edits when the quantity changes", () => {
    const edited: Attendee = {
      attendeeName: "Grace Hopper",
      attendeeEmail: "grace@example.test",
      answers: { meal: "vegan" },
    };
    expect(attendeesForQuantity({ standard: [edited] }, "standard", 2, viewer)[0]).toBe(edited);
  });
});
