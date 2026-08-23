import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { feedUrlFor } from "@/lib/calendar/categories";

describe("calendar subscriptions", () => {
  it("uses recognisable .ics URLs for the main and category feeds", () => {
    expect(feedUrlFor("nl")).toBe("http://localhost:3000/api/calendar/feed.ics");
    expect(feedUrlFor("en", "alumni")).toBe(
      "http://localhost:3000/api/calendar/feed/c/alumni.ics?lang=en",
    );
  });

  it("opens Google's From URL screen instead of the broken cid deeplink", () => {
    const source = readFileSync(
      path.join(process.cwd(), "components/site/CalendarSubscribe.tsx"),
      "utf8",
    );
    expect(source).toContain("/settings/addbyurl");
    expect(source).not.toContain("calendar/r?cid=");
  });
});
