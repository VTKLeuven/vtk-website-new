import { describe, expect, it } from "vitest";
import { storageKeyPath } from "@/lib/storageKeyPath";

describe("storage-key in een media-URL", () => {
  it("encodeert bijzondere tekens per segment en behoudt de mappen", () => {
    // Een key kan uit een bestandsnaam komen. Zonder segment-encoding breken
    // onder meer spaties, een hekje en een vraagteken de publieke media-URL.
    expect(storageKeyPath("images/grondplan #1?.jpg")).toBe(
      "images/grondplan%20%231%3F.jpg"
    );
  });
});
