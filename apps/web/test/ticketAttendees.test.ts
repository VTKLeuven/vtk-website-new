import { describe, expect, it } from "vitest";
import {
  attendeesForQuantity,
  retainAttendeesForQuantity,
  type Attendee,
} from "@/components/ticketing/public/TicketShop";

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

describe("ticket attendee slot retention", () => {
  it("retains previously typed attendee slots when decreasing quantity and restoring", () => {
    const first: Attendee = {
      attendeeName: viewer.name,
      attendeeEmail: viewer.email,
      answers: {},
    };
    const second: Attendee = {
      attendeeName: "Grace Hopper",
      attendeeEmail: "grace@example.test",
      answers: { meal: "vegan" },
    };

    const decreased = retainAttendeesForQuantity(
      { standard: [first, second] },
      "standard",
      1,
      viewer,
      { standard: 2 },
    );
    expect(decreased).toEqual([first, second]);
    expect(decreased.slice(0, 1)).toEqual([first]);

    const restored = retainAttendeesForQuantity(
      { standard: decreased },
      "standard",
      2,
      viewer,
      { standard: 1 },
    );
    expect(restored).toEqual([first, second]);
    expect(restored[1]).toBe(second);
  });

  it("retains attendee edits when quantity drops to zero and increases again", () => {
    const edited: Attendee = {
      attendeeName: "Grace Hopper",
      attendeeEmail: "grace@example.test",
      answers: { diet: "vegetarian" },
    };

    const atZero = retainAttendeesForQuantity(
      { standard: [edited] },
      "standard",
      0,
      viewer,
      { standard: 1 },
    );
    expect(atZero).toEqual([edited]);
    expect(atZero.slice(0, 0)).toEqual([]);

    const backToOne = retainAttendeesForQuantity(
      { standard: atZero },
      "standard",
      1,
      viewer,
      { standard: 0 },
    );
    expect(backToOne).toEqual([edited]);
  });

  it("prefills viewer on another line when prior retained slots have zero quantity", () => {
    const retained: Attendee = {
      attendeeName: viewer.name,
      attendeeEmail: viewer.email,
      answers: {},
    };
    expect(
      retainAttendeesForQuantity({ standard: [retained] }, "member", 1, viewer, {
        standard: 0,
        member: 0,
      }),
    ).toEqual([{ attendeeName: viewer.name, attendeeEmail: viewer.email, answers: {} }]);

    expect(
      retainAttendeesForQuantity({ standard: [retained] }, "member", 1, viewer, {
        standard: 1,
        member: 0,
      }),
    ).toEqual([{ attendeeName: "", attendeeEmail: "", answers: {} }]);
  });

  it("appends empty slots when growing past retained slots without overwriting edits", () => {
    const first: Attendee = {
      attendeeName: "Alan Turing",
      attendeeEmail: "alan@example.test",
      answers: {},
    };
    const grown = retainAttendeesForQuantity(
      { standard: [first] },
      "standard",
      3,
      viewer,
      { standard: 1 },
    );
    expect(grown).toEqual([
      first,
      { attendeeName: "", attendeeEmail: "", answers: {} },
      { attendeeName: "", attendeeEmail: "", answers: {} },
    ]);
  });
});
