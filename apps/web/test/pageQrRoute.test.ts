import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  createPng: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: { page: { findUnique: mocks.findUnique } },
}));

vi.mock("@/lib/shortlink-qr", () => ({
  createStyledVtkQrPng: mocks.createPng,
}));

import { GET } from "@/app/api/pages/[slug]/qr/route";

function request(query = "") {
  return new Request(`https://vtk.be/api/pages/theokot/qr${query}`, {
    headers: { host: "vtk.be" },
  });
}

function context(slug = "theokot") {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /api/pages/[slug]/qr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ slug: "theokot" });
    mocks.createPng.mockResolvedValue(Buffer.from("png-bytes"));
  });

  it("renders the public page URL without depending on an admin session", async () => {
    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="vtk-theokot-qr.png"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(mocks.createPng).toHaveBeenCalledWith("https://vtk.be/p/theokot");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("png-bytes");
  });

  it("serves the same PNG as a download when requested", async () => {
    const response = await GET(request("?download=1"), context());

    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="vtk-theokot-qr.png"',
    );
  });

  it("returns 404 for non-existent page slugs", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const response = await GET(request(), context("unknown"));

    expect(response.status).toBe(404);
    expect(mocks.createPng).not.toHaveBeenCalled();
  });
});
