import { describe, expect, it, vi } from "vitest";

/**
 * De standaardfoto van een evenement zonder eigen affiche.
 *
 * Er zijn er drie lagen: de eigen affiche, de standaardbanner van het thema, en
 * de sitebrede foto. Welke laag wint is niet zichtbaar in de admin (je ziet enkel
 * het resultaat op de kalender), dus een regressie hier valt pas op wanneer een
 * cantus met een career-foto op de homepage staat.
 */
vi.mock("@vtk/db", () => ({ prisma: {} }));

const { BUILTIN_DEFAULT_EVENT_IMAGE, defaultEventImageFor, defaultEventImages, eventCategorySlugs } =
  await import("@/lib/defaultEventImage");

const images = defaultEventImages({
  setting: { imageKey: "images/site-default.jpg" },
  categories: [
    { slug: "feest", order: 0, imageKey: "images/feest.jpg" },
    { slug: "cantus", order: 1, imageKey: "images/cantus.jpg" },
    // Een categorie zonder banner hoort hier niet in terecht te komen.
    { slug: "sport", order: 2, imageKey: null },
  ],
});

describe("defaultEventImageFor", () => {
  it("gives an event the banner of its theme", () => {
    expect(defaultEventImageFor(images, ["cantus"])).toBe("/api/media/images/cantus.jpg");
  });

  it("falls back to the site-wide photo without a theme banner", () => {
    expect(defaultEventImageFor(images, ["sport"])).toBe("/api/media/images/site-default.jpg");
    expect(defaultEventImageFor(images, [])).toBe("/api/media/images/site-default.jpg");
  });

  it("lets the highest theme in the admin win, whatever order the caller passes", () => {
    expect(defaultEventImageFor(images, ["cantus", "feest"])).toBe("/api/media/images/feest.jpg");
    expect(defaultEventImageFor(images, ["feest", "cantus"])).toBe("/api/media/images/feest.jpg");
  });

  it("skips categories it does not know, such as an audience", () => {
    expect(defaultEventImageFor(images, ["eerstejaars", "cantus"])).toBe(
      "/api/media/images/cantus.jpg",
    );
  });

  it("falls back to the bundled photo when nothing is configured", () => {
    const bare = defaultEventImages({ setting: undefined, categories: [] });
    expect(defaultEventImageFor(bare, ["feest"])).toBe(BUILTIN_DEFAULT_EVENT_IMAGE);
  });
});

describe("eventCategorySlugs", () => {
  it("reads the slugs out of the join rows the queries return", () => {
    expect(eventCategorySlugs([{ category: { slug: "feest" } }, { category: { slug: "sport" } }])).toEqual([
      "feest",
      "sport",
    ]);
  });
});
