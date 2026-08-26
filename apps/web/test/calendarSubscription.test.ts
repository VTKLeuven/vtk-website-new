import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { feedBaseUrlFor } from "@/lib/calendar/categories";
import { feedScopeFromQuery } from "@/lib/calendar/http";

describe("calendar subscriptions", () => {
  it("uses a recognisable .ics URL for the main feed", () => {
    expect(feedBaseUrlFor("nl")).toBe("http://localhost:3000/api/calendar/feed.ics");
    expect(feedBaseUrlFor("en")).toBe("http://localhost:3000/api/calendar/feed.ics?lang=en");
  });

  it("reads the selection out of the feed query", () => {
    const scope = (search: string) =>
      feedScopeFromQuery(new URL(`http://localhost:3000/api/calendar/feed.ics${search}`));

    // Geen selectie blijft "alles": bestaande abonnementen mogen niet veranderen.
    expect(scope("")).toEqual({ kind: "all" });
    expect(scope("?lang=en")).toEqual({ kind: "all" });

    expect(scope("?c=alumni")).toEqual({ kind: "mix", slugs: ["alumni"], includeGeneral: false });
    expect(scope("?c=alumni&algemeen=1")).toEqual({
      kind: "mix",
      slugs: ["alumni"],
      includeGeneral: true,
    });
    expect(scope("?c=sport&c=cultuur")).toEqual({
      kind: "mix",
      slugs: ["sport", "cultuur"],
      includeGeneral: false,
    });
    // Agenda-clients hangen graag een .ics achter elk stuk van de URL.
    expect(scope("?c=alumni.ics")).toEqual({
      kind: "mix",
      slugs: ["alumni"],
      includeGeneral: false,
    });
    // Dezelfde categorie twee keer is één keer.
    expect(scope("?c=sport&c=sport")).toEqual({
      kind: "mix",
      slugs: ["sport"],
      includeGeneral: false,
    });
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
