import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * De magazines zoals de app ze binnenkrijgt.
 *
 * Tot november 2026 gaf `url` het adres van het opgeslagen object
 * (`/api/media/publications/<hash>.pdf`). Dat valt onder de route van de plank
 * (`publications/[publicationId]`, één segment) en niet onder `[...key]`, en die
 * kent geen editie die zo heet: elk nummer in de app was een 404. Deze test volgt
 * daarom het adres tot in de route die het echt beantwoordt.
 */

const mocks = vi.hoisted(() => ({
  getMediaContent: vi.fn(),
  getObjectStream: vi.fn(),
}));

vi.mock("@/lib/media-content", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media-content")>()),
  getMediaContent: mocks.getMediaContent,
}));

vi.mock("@/lib/immich-gallery", () => ({
  listImmichGalleryAlbums: vi.fn(async () => ({ albums: [] })),
}));

vi.mock("@vtk/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vtk/storage")>()),
  getObjectStream: mocks.getObjectStream,
}));

import { GET as mediaGet } from "@/app/api/app/v1/media/route";
import { GET as publicationGet } from "@/app/api/media/publications/[publicationId]/route";

function appRequest(path: string) {
  return new Request(`http://intern:3000${path}`, {
    headers: { "x-forwarded-host": "vtk.be", "x-forwarded-proto": "https" },
  });
}

const WITH_PAGES = {
  id: "bakske-week-9-semester-1-2026-2027",
  kind: "bakske",
  titleNl: "Het Bakske",
  issueNl: "Week 9/ Semester 1, 2026-2027",
  publishedAt: "2026-11-16",
  storageKey: "publications/d47cd401769c2301d3b7cce4.pdf",
  coverKey: "publications/covers/df0be5c4d571f15eeeeda175.jpg",
  pageKeys: [
    "publications/pages/aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    "publications/pages/bbbbbbbbbbbbbbbbbbbbbbbb.jpg",
  ],
};

const WITHOUT_PAGES = {
  id: "ir-reeel-2025-september",
  kind: "ir-reeel",
  titleNl: "Ir.Reëel",
  issueNl: "September 2025, 2025-2026",
  publishedAt: "2025-09-01",
  storageKey: "publications/ir-reeel-2025-september.pdf",
};

describe("GET /api/app/v1/media, magazines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMediaContent.mockResolvedValue({ videos: [], publications: [WITH_PAGES, WITHOUT_PAGES] });
    mocks.getObjectStream.mockResolvedValue({
      stream: Readable.from(Buffer.from("%PDF-mock")),
      contentType: "application/pdf",
      contentLength: 9,
      contentRange: undefined,
      etag: undefined,
      lastModified: undefined,
    });
  });

  it("geeft een pdf-adres dat de route van de plank echt beantwoordt", async () => {
    const body = await (await mediaGet(appRequest("/api/app/v1/media?locale=nl"))).json();

    for (const publication of body.publications) {
      const url = new URL(publication.url);
      expect(url.origin).toBe("https://vtk.be");
      expect(url.pathname).toBe(`/api/media/publications/${publication.id}`);

      // Het laatste segment is wat Next als `publicationId` doorgeeft.
      const publicationId = decodeURIComponent(url.pathname.split("/").pop()!);
      const response = await publicationGet(new Request(url), {
        params: Promise.resolve({ publicationId }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toMatch(/^inline;/);
    }
  });

  it("geeft de bladzijden als absolute URL's, in volgorde, en null zonder", async () => {
    const body = await (await mediaGet(appRequest("/api/app/v1/media?locale=nl"))).json();
    const [bakske, irReeel] = body.publications;

    expect(bakske.pages).toEqual([
      "https://vtk.be/api/media/publications/pages/aaaaaaaaaaaaaaaaaaaaaaaa.jpg",
      "https://vtk.be/api/media/publications/pages/bbbbbbbbbbbbbbbbbbbbbbbb.jpg",
    ]);
    expect(irReeel.pages).toBeNull();
  });
});
