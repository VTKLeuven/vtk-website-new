import { describe, expect, it } from "vitest";
import {
  availableTicketCount,
  formatTicketOrderStatus,
  maximumSelectableForType,
  nextTicketQuantity,
  type PublicTicketType,
} from "@/components/ticketing/public/types";

function ticketType(
  id: string,
  inventoryPoolId: string,
  available: number,
): PublicTicketType {
  return {
    id,
    inventoryPoolId,
    name: id,
    priceCents: 1_000,
    available,
    active: true,
  };
}

describe("public ticket inventory presentation", () => {
  it("counts a shared inventory pool only once", () => {
    const types = [
      ticketType("student", "general", 5),
      ticketType("regular", "general", 5),
      ticketType("vip", "vip", 3),
    ];
    expect(availableTicketCount(types)).toBe(8);
  });

  it("subtracts other ticket types selected from the same pool", () => {
    const student = ticketType("student", "general", 5);
    const regular = ticketType("regular", "general", 5);
    expect(maximumSelectableForType({
      type: regular,
      ticketTypes: [student, regular],
      quantities: { student: 4 },
      maxTicketsPerOrder: 8,
    })).toBe(1);
  });

  it("steps between zero and a ticket type minimum without trapping the selection", () => {
    expect(nextTicketQuantity({
      current: 0,
      direction: "increase",
      minimum: 2,
      maximum: 5,
    })).toBe(2);
    expect(nextTicketQuantity({
      current: 2,
      direction: "decrease",
      minimum: 2,
      maximum: 5,
    })).toBe(0);
  });
});

describe("public order status labels", () => {
  it("localizes every customer-facing order status", () => {
    expect(formatTicketOrderStatus("PAID", "nl")).toBe("Betaald");
    expect(formatTicketOrderStatus("PARTIALLY_REFUNDED", "nl")).toBe("Deels terugbetaald");
    expect(formatTicketOrderStatus("PAYMENT_FAILED", "en")).toBe("Payment failed");
  });
});
