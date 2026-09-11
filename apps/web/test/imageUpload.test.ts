import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  IMAGE_UPLOAD_MAX_MB,
  imageTooSmallWarning,
  imageUploadError,
  imageUploadSizeError,
} from "@/lib/imageUpload";

describe("image upload feedback", () => {
  it.each(["image", "logo"] as const)("checks the %s limit before uploading", (kind) => {
    const limit = IMAGE_UPLOAD_MAX_MB[kind] * 1024 * 1024;
    expect(imageUploadSizeError({ size: limit }, "nl", kind)).toBeNull();
    expect(imageUploadSizeError({ size: limit + 1 }, "nl", kind)).toContain(`${IMAGE_UPLOAD_MAX_MB[kind]} MB`);
    expect(imageUploadSizeError({ size: limit + 1 }, "en", kind)).toContain("Choose a smaller file");
  });

  it("allows photos above the old proxy limit", () => {
    expect(imageUploadSizeError({ size: 11 * 1024 * 1024 }, "nl")).toBeNull();
  });

  it("explains rejected images and network failures in both languages", () => {
    expect(imageUploadError("nl", 415)).toContain("JPG of PNG");
    expect(imageUploadError("en", 415)).toContain("JPG or PNG");
    expect(imageUploadError("nl")).toContain("niet bewaard");
    expect(imageUploadError("en", 500)).toContain("not saved");
    expect(imageUploadError("nl", 413)).toContain("45 MB");
  });

  it("keeps client limits aligned with the upload route", () => {
    const route = readFileSync(new URL("../app/api/admin/upload/route.ts", import.meta.url), "utf8");
    for (const [kind, mb] of Object.entries(IMAGE_UPLOAD_MAX_MB)) {
      expect(route).toMatch(new RegExp(`${kind}:\\s*${mb} \\* 1024 \\* 1024`));
    }
  });
});

describe("te kleine foto's", () => {
  it("warns about a photo that gets enlarged, in both languages", () => {
    expect(imageTooSmallWarning(596, 1600, "nl")).toContain("596 px breed");
    expect(imageTooSmallWarning(596, 1600, "nl")).toContain("1600 px");
    expect(imageTooSmallWarning(596, 1600, "en")).toContain("blurry");
  });

  it("stays quiet for a photo that is wide enough", () => {
    expect(imageTooSmallWarning(1600, 1600, "nl")).toBeNull();
    expect(imageTooSmallWarning(6960, 1600, "nl")).toBeNull();
  });

  /** Een PDF of een document komt zonder maten terug uit de uploadroute. */
  it("stays quiet when the upload has no dimensions", () => {
    expect(imageTooSmallWarning(null, 1600, "nl")).toBeNull();
    expect(imageTooSmallWarning(undefined, 1600, "nl")).toBeNull();
  });

  /**
   * De waarschuwing heeft de maten uit het antwoord van de uploadroute nodig;
   * die zijn er enkel voor `kind: "image"`, en het eventveld hangt eraan.
   */
  it("is fed by the dimensions the upload route returns", () => {
    const route = readFileSync(new URL("../app/api/admin/upload/route.ts", import.meta.url), "utf8");
    expect(route).toMatch(/width: dimensions\?\.width \?\? null/);
    const field = readFileSync(
      new URL("../app/[locale]/admin/kalender/EventImageField.tsx", import.meta.url),
      "utf8",
    );
    expect(field).toContain("minWidth={1600}");
  });
});
