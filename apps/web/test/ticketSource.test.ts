import { describe, expect, it } from "vitest";
import {
  describeSource,
  sanitizeSourceKey,
  sourceFromLanding,
  sourceQuery,
  withSource,
} from "@/lib/ticketing/source";

const ORIGIN = "https://vtk.be";

describe("ticket source", () => {
  it("prefers our own via parameter, with its campaign", () => {
    expect(sourceFromLanding("?via=Facebook&c=Story%201", "https://l.facebook.com/", ORIGIN)).toEqual({
      source: "facebook",
      campaign: "story-1",
    });
  });

  it("reads utm parameters for people who already use them", () => {
    expect(sourceFromLanding("?utm_source=newsletter&utm_campaign=week-3", "", ORIGIN)).toEqual({
      source: "newsletter",
      campaign: "week-3",
    });
  });

  it("recognises a Facebook click id without a referrer", () => {
    expect(sourceFromLanding("?fbclid=abc", "", ORIGIN).source).toBe("facebook");
  });

  it("maps an external referrer to its channel, and only keeps the host", () => {
    expect(sourceFromLanding("", "https://m.facebook.com/groups/123", ORIGIN).source).toBe("facebook");
    expect(sourceFromLanding("", "https://www.google.be/search?q=cantus", ORIGIN).source).toBe("zoekmachine");
    expect(sourceFromLanding("", "https://toledo.kuleuven.be/portal", ORIGIN).source).toBe("kuleuven");
    expect(sourceFromLanding("", "https://forum.example.org/thread/9", ORIGIN).source).toBe("example.org");
  });

  it("maps a page on our own site to a coarse place", () => {
    expect(sourceFromLanding("", "https://vtk.be/", ORIGIN).source).toBe("home");
    expect(sourceFromLanding("", "https://www.vtk.be/en/kalender/cantus", ORIGIN).source).toBe("kalender-event");
    expect(sourceFromLanding("", "https://vtk.be/kalender", ORIGIN).source).toBe("kalender");
    expect(sourceFromLanding("", "https://vtk.be/tickets", ORIGIN).source).toBe("tickets");
    expect(sourceFromLanding("", "https://vtk.be/inloggen?next=x", ORIGIN).source).toBe("direct");
  });

  it("falls back to direct without anything to go on", () => {
    expect(sourceFromLanding("", "", ORIGIN)).toEqual({ source: "direct", campaign: null });
    expect(sourceFromLanding("", "not a url", ORIGIN).source).toBe("direct");
  });

  it("cleans whatever a browser sends", () => {
    expect(sanitizeSourceKey("  Flyer Agora!! ")).toBe("flyer-agora");
    expect(sanitizeSourceKey("<script>")).toBe("script");
    expect(sanitizeSourceKey("---")).toBeNull();
    expect(sanitizeSourceKey(42)).toBeNull();
    expect(sanitizeSourceKey("x".repeat(80))).toHaveLength(40);
  });

  it("passes a known source on, but not direct", () => {
    expect(sourceQuery({ source: "facebook", campaign: "story" })).toBe("?via=facebook&c=story");
    expect(sourceQuery({ source: "direct", campaign: null })).toBe("");
    expect(sourceQuery(null)).toBe("");
    expect(withSource("/kalender/cantus", "home-agenda")).toBe("/kalender/cantus?via=home-agenda");
    expect(withSource("/tickets/x?preview=1", "nieuws")).toBe("/tickets/x?preview=1&via=nieuws");
  });

  it("names a missing source as not measured, never as direct", () => {
    expect(describeSource(null, "nl").kind).toBe("unknown");
    expect(describeSource("direct", "nl").kind).toBe("direct");
    expect(describeSource("flyer-agora", "nl")).toEqual({ label: "flyer-agora", kind: "extern" });
  });
});
