import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  createPng: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: { shortLink: { findUnique: mocks.findUnique } },
}));

vi.mock("@/lib/shortlink-qr", () => ({
  createStyledShortlinkQrPng: mocks.createPng,
}));

import { GET } from "@/app/api/shortlinks/[slug]/qr/route";

function request(query = "") {
  return new Request(`https://dev.vtk.be/api/shortlinks/test/qr${query}`, {
    headers: { host: "dev.vtk.be" },
  });
}

function context(slug = "test") {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /api/shortlinks/[slug]/qr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ slug: "test" });
    mocks.createPng.mockResolvedValue(Buffer.from("png-bytes"));
  });

  it("renders the public short URL without depending on an admin session", async () => {
    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="vtk-test-qr.png"',
    );
    expect(mocks.createPng).toHaveBeenCalledWith("https://on.dev.vtk.be/test");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("png-bytes");
  });

  it("serves the same PNG as a download", async () => {
    const response = await GET(request("?download=1"), context());

    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="vtk-test-qr.png"',
    );
  });

  it("does not become a general-purpose QR renderer for unknown slugs", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const response = await GET(request(), context("unknown"));

    expect(response.status).toBe(404);
    expect(mocks.createPng).not.toHaveBeenCalled();
  });
});
