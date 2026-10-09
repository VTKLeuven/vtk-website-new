import { describe, expect, it } from "vitest";
import { MockPaymentGateway } from "@vtk/payments";

describe("MockPaymentGateway", () => {
  // `closeLivePayments` sluit een checkout af en vraagt dan de status op; bleef
  // die "pending", dan verviel een lokale bestelling nooit.
  it("reports a checkout as expired once it was closed, also from a new instance", async () => {
    const gateway = () => new MockPaymentGateway({ completePath: "/api/tickets/mock/complete" });
    expect((await gateway().getCheckoutStatus("mock_order_1")).status).toBe("PENDING");
    await gateway().expireCheckout("mock_order_1");
    expect((await gateway().getCheckoutStatus("mock_order_1")).status).toBe("EXPIRED");
    expect((await gateway().getCheckoutStatus("mock_order_2")).status).toBe("PENDING");
  });
});
