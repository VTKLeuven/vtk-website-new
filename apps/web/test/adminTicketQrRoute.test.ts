import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  findFirst: vi.fn(),
  createCredential: vi.fn(),
  createPng: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: { ticket: { findFirst: mocks.findFirst } },
}));

vi.mock("@/lib/ticketing/authorization", () => ({
  requireTicketEventCapability: mocks.requireCapability,
}));

vi.mock("@/lib/ticketing/crypto", () => ({
  createTicketCredential: mocks.createCredential,
}));

vi.mock("@/lib/shortlink-qr", () => ({
  createStyledVtkQrPng: mocks.createPng,
}));

import { GET } from "@/app/api/tickets/events/[eventId]/attendees/[ticketId]/qr/route";

function context(eventId = "event-id", ticketId = "ticket-id") {
  return { params: Promise.resolve({ eventId, ticketId }) };
}

function request() {
  return new Request("https://vtk.be/api/tickets/events/event-id/attendees/ticket-id/qr");
}

describe("GET /api/tickets/events/[eventId]/attendees/[ticketId]/qr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCapability.mockResolvedValue({ event: { id: "event-id" } });
    mocks.findFirst.mockResolvedValue({ publicCode: "public-code", credentialVersion: 2 });
    mocks.createCredential.mockReturnValue("signed-ticket-credential");
    mocks.createPng.mockResolvedValue(Buffer.from("styled-ticket-qr"));
  });

  it("draws the attendee's own credential for someone who may see the attendees", async () => {
    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(mocks.requireCapability).toHaveBeenCalledWith("event-id", "VIEW_ATTENDEES");
    expect(mocks.createCredential).toHaveBeenCalledWith("public-code", 2);
    expect(mocks.createPng).toHaveBeenCalledWith("signed-ticket-credential");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("styled-ticket-qr");
  });

  it("scopes the ticket to the event in the URL", async () => {
    await GET(request(), context());

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ticket-id", eventId: "event-id" } })
    );
  });

  it("does not draw a QR for a ticket of another event", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(mocks.createCredential).not.toHaveBeenCalled();
    expect(mocks.createPng).not.toHaveBeenCalled();
  });

  it("does not draw a QR without the attendees capability", async () => {
    mocks.requireCapability.mockRejectedValue(new Error("FORBIDDEN"));

    const response = await GET(request(), context());

    expect(response.status).toBe(403);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.createPng).not.toHaveBeenCalled();
  });
});
