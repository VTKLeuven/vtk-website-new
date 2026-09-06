import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getObjectStream: vi.fn(),
}));

vi.mock("@vtk/storage", () => ({
  getObjectStream: mocks.getObjectStream,
}));

import { GET } from "@/app/api/media/[...key]/route";

function createRequest(path: string) {
  return new Request(`https://vtk.be${path}`);
}

function createContext(segments: string[]) {
  return { params: Promise.resolve({ key: segments }) };
}

describe("GET /api/media/[...key]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getObjectStream.mockResolvedValue({
      stream: Readable.from(Buffer.from("%PDF-mock-content")),
      contentType: "application/pdf",
      contentLength: 17,
      contentRange: undefined,
      etag: '"etag123"',
      lastModified: new Date("2026-09-01T12:00:00Z"),
    });
  });

  it("serves a PDF with inline disposition and filename parameter", async () => {
    const res = await GET(
      createRequest("/api/media/pdfs/12345678.pdf?filename=vrijwilligersnota.pdf"),
      createContext(["pdfs", "12345678.pdf"]),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(
      'inline; filename="vrijwilligersnota.pdf"; filename*=UTF-8\'\'vrijwilligersnota.pdf',
    );
  });

  it("serves generic files as attachment downloads", async () => {
    mocks.getObjectStream.mockResolvedValue({
      stream: Readable.from(Buffer.from("binary-data")),
      contentType: "application/octet-stream",
      contentLength: 11,
      contentRange: undefined,
      etag: '"etag456"',
      lastModified: new Date("2026-09-01T12:00:00Z"),
    });

    const res = await GET(
      createRequest("/api/media/files/abcdef.docx?filename=draaiboek.docx"),
      createContext(["files", "abcdef.docx"]),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="draaiboek.docx"; filename*=UTF-8\'\'draaiboek.docx',
    );
  });

  it("forces attachment when ?download is set on a PDF", async () => {
    const res = await GET(
      createRequest("/api/media/pdfs/12345678.pdf?filename=nota.pdf&download=1"),
      createContext(["pdfs", "12345678.pdf"]),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="nota.pdf"; filename*=UTF-8\'\'nota.pdf',
    );
  });

  it("sanitizes quotes and backslashes in requested filenames", async () => {
    const res = await GET(
      createRequest('/api/media/pdfs/12345678.pdf?filename=nota"test\\foo.pdf'),
      createContext(["pdfs", "12345678.pdf"]),
    );

    expect(res.headers.get("content-disposition")).toContain('filename="nota_test_foo.pdf"');
  });

  it("returns 404 when the object is not found", async () => {
    mocks.getObjectStream.mockRejectedValue(new Error("NoSuchKey"));

    const res = await GET(
      createRequest("/api/media/pdfs/unknown.pdf"),
      createContext(["pdfs", "unknown.pdf"]),
    );

    expect(res.status).toBe(404);
  });
});
