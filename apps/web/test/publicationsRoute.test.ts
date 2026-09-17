import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getObjectStream: vi.fn(),
  getMediaContent: vi.fn(),
}));

vi.mock("@vtk/storage", () => ({
  getObjectStream: mocks.getObjectStream,
}));

vi.mock("@/lib/media-content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media-content")>();
  return {
    ...actual,
    getMediaContent: mocks.getMediaContent,
  };
});

import { GET } from "@/app/api/media/publications/[publicationId]/route";

function createRequest(path: string, headers?: HeadersInit) {
  return new Request(`https://vtk.be${path}`, { headers });
}

function createContext(publicationId: string) {
  return { params: Promise.resolve({ publicationId }) };
}

describe("GET /api/media/publications/[publicationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMediaContent.mockResolvedValue({
      videos: [],
      publications: [
        {
          id: "bakske-2025-2026-s2w6",
          kind: "bakske",
          titleNl: "Het Bakske",
          issueNl: "Week 6 / Semester 2, 2025-2026",
          storageKey: "publications/bakske-2025-2026-s2w6.pdf",
        },
      ],
    });
    mocks.getObjectStream.mockResolvedValue({
      stream: Readable.from(Buffer.from("%PDF-mock-content")),
      contentType: "application/pdf",
      contentLength: 17,
      contentRange: undefined,
      etag: '"etag123"',
      lastModified: new Date("2026-09-01T12:00:00Z"),
    });
  });

  it("serves a publication PDF with inline disposition from storage", async () => {
    const res = await GET(
      createRequest("/api/media/publications/bakske-2025-2026-s2w6"),
      createContext("bakske-2025-2026-s2w6"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="bakske-2025-2026-s2w6.pdf"');
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.getObjectStream).toHaveBeenCalledWith(
      "publications/bakske-2025-2026-s2w6.pdf",
      null,
    );
  });

  it("passes byte range header to getObjectStream and returns 206", async () => {
    mocks.getObjectStream.mockResolvedValue({
      stream: Readable.from(Buffer.from("%PDF")),
      contentType: "application/pdf",
      contentLength: 4,
      contentRange: "bytes 0-3/17",
      etag: '"etag123"',
      lastModified: new Date("2026-09-01T12:00:00Z"),
    });

    const res = await GET(
      createRequest("/api/media/publications/bakske-2025-2026-s2w6", { range: "bytes=0-3" }),
      createContext("bakske-2025-2026-s2w6"),
    );

    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-3/17");
    expect(mocks.getObjectStream).toHaveBeenCalledWith(
      "publications/bakske-2025-2026-s2w6.pdf",
      "bytes=0-3",
    );
  });

  it("returns 404 for an unknown publication", async () => {
    const res = await GET(
      createRequest("/api/media/publications/unknown-issue"),
      createContext("unknown-issue"),
    );

    expect(res.status).toBe(404);
  });

  it("returns 502 when object storage throws an error", async () => {
    mocks.getObjectStream.mockRejectedValue(new Error("Storage unavailable"));

    const res = await GET(
      createRequest("/api/media/publications/bakske-2025-2026-s2w6"),
      createContext("bakske-2025-2026-s2w6"),
    );

    expect(res.status).toBe(502);
  });
});
