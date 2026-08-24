import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveTicket: vi.fn(),
  createCredential: vi.fn(),
  createPng: vi.fn(),
}));

vi.mock("@/lib/ticketing/ticketAccess", () => ({
  resolveAuthorizedTicket: mocks.resolveTicket,
}));

vi.mock("@/lib/ticketing/crypto", () => ({
  createTicketCredential: mocks.createCredential,
}));

vi.mock("@/lib/shortlink-qr", () => ({
  createStyledVtkQrPng: mocks.createPng,
}));

import { GET } from "@/app/api/tickets/[ticketId]/qr/route";

function context(ticketId = "ticket-id") {
  return { params: Promise.resolve({ ticketId }) };
}

describe("GET /api/tickets/[ticketId]/qr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTicket.mockResolvedValue({
      ticket: { publicCode: "public-code", credentialVersion: 2 },
      order: {},
    });
    mocks.createCredential.mockReturnValue("signed-ticket-credential");
    mocks.createPng.mockResolvedValue(Buffer.from("styled-ticket-qr"));
  });

  it("uses the shared styled renderer for an authorized ticket", async () => {
    const response = await GET(new Request("https://vtk.be/api/tickets/ticket-id/qr"), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(mocks.resolveTicket).toHaveBeenCalledWith("ticket-id");
    expect(mocks.createCredential).toHaveBeenCalledWith("public-code", 2);
    expect(mocks.createPng).toHaveBeenCalledWith("signed-ticket-credential");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("styled-ticket-qr");
  });

  it("does not render a QR for an unauthorized ticket", async () => {
    mocks.resolveTicket.mockResolvedValue(null);

    const response = await GET(new Request("https://vtk.be/api/tickets/unknown/qr"), context("unknown"));

    expect(response.status).toBe(404);
    expect(mocks.createCredential).not.toHaveBeenCalled();
    expect(mocks.createPng).not.toHaveBeenCalled();
  });
});
