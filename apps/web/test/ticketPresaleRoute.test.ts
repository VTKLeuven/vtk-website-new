import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    ticketEvent: {
      findUnique: mocks.findUnique,
    },
  },
}));

import { GET } from "@/app/[locale]/tickets/[slug]/voorverkoop/[token]/route";

function context(locale = "nl", slug = "cantus", token = "valid-token-1234") {
  return {
    params: Promise.resolve({ locale, slug, token }),
  };
}

describe("GET /[locale]/tickets/[slug]/voorverkoop/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to the relative shop URL and sets cookie for valid presale link", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "ev-cantus-1",
      presaleToken: "valid-token-1234",
      salesStartAt: new Date(Date.now() + 3600_000),
    });

    const request = new Request("https://localhost:3000/tickets/cantus/voorverkoop/valid-token-1234");
    const response = await GET(request, context("nl", "cantus", "valid-token-1234"));

    expect(response.status).toBe(307);
    // Crucial: relative Location prevents leaking internal reverse-proxy origin (e.g. localhost:3000)
    expect(response.headers.get("location")).toBe("/tickets/cantus");
    expect(response.headers.get("location")).not.toContain("localhost:3000");

    const cookie = response.headers.get("set-cookie");
    expect(cookie).toBeTruthy();
    expect(cookie).toContain("valid-token-1234");
    expect(cookie).toContain("vtk_presale_");
  });

  it("redirects with language prefix when English is requested", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "ev-cantus-1",
      presaleToken: "valid-token-1234",
      salesStartAt: new Date(Date.now() + 3600_000),
    });

    const request = new Request("https://localhost:3000/en/tickets/cantus/voorverkoop/valid-token-1234");
    const response = await GET(request, context("en", "cantus", "valid-token-1234"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/en/tickets/cantus");
  });

  it("redirects to shop without presale cookie if token does not match", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "ev-cantus-1",
      presaleToken: "other-token",
      salesStartAt: new Date(Date.now() + 3600_000),
    });

    const request = new Request("https://localhost:3000/tickets/cantus/voorverkoop/wrong-token");
    const response = await GET(request, context("nl", "cantus", "wrong-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/tickets/cantus");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("redirects to shop without presale cookie if event not found", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const request = new Request("https://localhost:3000/tickets/unknown/voorverkoop/some-token");
    const response = await GET(request, context("nl", "unknown", "some-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/tickets/unknown");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 404 for an invalid locale", async () => {
    const request = new Request("https://localhost:3000/de/tickets/cantus/voorverkoop/some-token");
    const response = await GET(request, context("de", "cantus", "some-token"));

    expect(response.status).toBe(404);
  });
});
