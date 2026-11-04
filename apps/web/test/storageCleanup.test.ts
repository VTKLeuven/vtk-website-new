import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: new Map<string, unknown>(),
  orphans: [] as Array<{ key: string; sizeBytes: number; firstSeenAt: Date }>,
  objects: [] as Array<{ key: string; sizeBytes: number; lastModified: Date | null }>,
  columns: [] as Array<{ table_name: string; column_name: string }>,
  /** Per tabel de stammen die de scan daar "vindt". */
  stemsByTable: new Map<string, string[]>(),
  scannedSql: [] as string[],
  deleteObject: vi.fn<(key: string) => Promise<void>>(async () => undefined),
  logSystemAudit: vi.fn(async () => undefined),
}));

vi.mock("@vtk/storage", () => ({
  deleteObject: mocks.deleteObject,
  getObjectStorageInventory: vi.fn(async () => ({ bucket: "vtk", objects: mocks.objects, totalBytes: 0 })),
}));
vi.mock("@/lib/audit", () => ({ logSystemAudit: mocks.logSystemAudit }));
vi.mock("@vtk/db", () => ({
  prisma: {
    setting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        mocks.settings.has(where.key) ? { key: where.key, value: mocks.settings.get(where.key) } : null,
      ),
      upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => {
        mocks.settings.set(where.key, create.value);
      }),
    },
    storageOrphan: {
      findMany: vi.fn(async () => mocks.orphans.map((row) => ({ ...row }))),
      deleteMany: vi.fn(async ({ where }: { where: { key: { in: string[] } } }) => {
        mocks.orphans = mocks.orphans.filter((row) => !where.key.in.includes(row.key));
      }),
      createMany: vi.fn(async ({ data }: { data: Array<{ key: string; sizeBytes: number; firstSeenAt: Date }> }) => {
        for (const row of data) if (!mocks.orphans.some((o) => o.key === row.key)) mocks.orphans.push(row);
      }),
    },
    $queryRaw: vi.fn(async () => mocks.columns),
    $queryRawUnsafe: vi.fn(async (sql: string) => {
      mocks.scannedSql.push(sql);
      const table = /FROM "([^"]+)"/.exec(sql)?.[1] ?? "";
      return (mocks.stemsByTable.get(table) ?? []).map((stem) => ({ stem }));
    }),
  },
}));

import {
  CLEANUP_PREFIXES,
  GRACE_DAYS,
  MAX_DELETES_PER_RUN,
  MIN_OBJECT_AGE_DAYS,
  REFERENCE_PATTERN,
  SCAN_EXCLUDED_TABLES,
  cleanupStem,
  extractReferencedStems,
  planCleanup,
  tableScanSql,
} from "@/lib/storage-cleanup-plan";
import {
  CLEANUP_SETTING_KEY,
  runNightlyStorageCleanup,
  runStorageCleanup,
} from "@/lib/storage-cleanup";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-04T10:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
const hex = (char: string) => char.repeat(24);

describe("welke keys de opruiming kent", () => {
  it("herkent de vorm van newStorageKey in de opruimbare mappen", () => {
    expect(cleanupStem(`pdfs/${hex("a")}.pdf`)).toBe(`pdfs/${hex("a")}`);
    expect(cleanupStem(`images/${hex("b")}.jpg`)).toBe(`images/${hex("b")}`);
    expect(cleanupStem(`files/${hex("c")}`)).toBe(`files/${hex("c")}`);
    expect(cleanupStem(`files/${hex("d")}.bar baz`)).toBe(`files/${hex("d")}`);
  });

  it("laat mappen met een eigenaar-rij en andere vormen links liggen", () => {
    expect(cleanupStem(`bonnetjes/${hex("a")}.jpg`)).toBeNull();
    expect(cleanupStem(`forms/form_1/${hex("a")}.pdf`)).toBeNull();
    expect(cleanupStem(`images/sub/${hex("a")}.jpg`)).toBeNull();
    expect(cleanupStem(`uploads/1699999999-poster.jpg`)).toBeNull();
    expect(cleanupStem(`images/${"a".repeat(23)}.jpg`)).toBeNull();
  });

  it("raakt de boekhouding nooit aan", () => {
    expect(CLEANUP_PREFIXES).not.toContain("bonnetjes");
  });
});

describe("verwijzingen vinden in een tekst", () => {
  it("vindt een link uit de editor, met of zonder bestandsnaam erachter", () => {
    const markdown = `[Intern Reglement](/api/media/pdfs/${hex("a")}.pdf?filename=Intern_Reglement_20241013.pdf)`;
    expect([...extractReferencedStems(markdown)]).toEqual([`pdfs/${hex("a")}`]);
  });

  it("vindt een absolute URL, een kale key en een URL-gecodeerde key", () => {
    const text = [
      `https://vtk.be/api/media/images/${hex("a")}.jpg`,
      `{"imageKey":"logos/${hex("b")}.png"}`,
      `/_next/image?url=%2Fapi%2Fmedia%2Fimages%2F${hex("c")}.jpg&w=640`,
      `FILES/${hex("D")}`,
    ].join(" ");
    expect([...extractReferencedStems(text)].sort()).toEqual(
      [`files/${hex("d")}`, `images/${hex("a")}`, `images/${hex("c")}`, `logos/${hex("b")}`].sort(),
    );
  });

  it("geeft de SQL hetzelfde patroon mee als dat hier getest wordt", () => {
    const sql = tableScanSql("Page", ["contentNl", "contentEn"]);
    expect(sql).toContain("regexp_matches(array_to_string(ARRAY[");
    expect(sql).toContain("$1, 'gi'");
    expect(sql).toContain('t."contentNl"::text, t."contentEn"::text');
    expect(REFERENCE_PATTERN).toContain(CLEANUP_PREFIXES.join("|"));
  });

  it("citeert een tabelnaam veilig", () => {
    expect(tableScanSql('We"ird', ["x"])).toContain('FROM "We""ird" t');
  });

  it("zoekt nooit in de eigen weestabel", () => {
    expect(SCAN_EXCLUDED_TABLES.has("StorageOrphan")).toBe(true);
  });
});

describe("het plan van een ronde", () => {
  const old = daysAgo(MIN_OBJECT_AGE_DAYS + 1);

  it("markeert een oud bestand zonder verwijzing en laat een verwezen bestand staan", () => {
    const plan = planCleanup({
      objects: [
        { key: `pdfs/${hex("a")}.pdf`, sizeBytes: 100, lastModified: old },
        { key: `pdfs/${hex("b")}.pdf`, sizeBytes: 200, lastModified: old },
      ],
      referencedStems: new Set([`pdfs/${hex("a")}`]),
      existing: [],
      now: NOW,
    });
    expect(plan.checked).toBe(2);
    expect(plan.referenced).toBe(1);
    expect(plan.newOrphans).toEqual([{ key: `pdfs/${hex("b")}.pdf`, sizeBytes: 200 }]);
    expect(plan.due).toEqual([]);
  });

  it("beoordeelt een recente upload nog niet: het formulier kan nog bewaard worden", () => {
    const plan = planCleanup({
      objects: [
        { key: `images/${hex("a")}.jpg`, sizeBytes: 1, lastModified: daysAgo(1) },
        { key: `images/${hex("b")}.jpg`, sizeBytes: 1, lastModified: null },
      ],
      referencedStems: new Set(),
      existing: [],
      now: NOW,
    });
    expect(plan.tooRecent).toBe(2);
    expect(plan.newOrphans).toEqual([]);
  });

  it("telt een andere map niet en houdt een onbekende vorm altijd", () => {
    const plan = planCleanup({
      objects: [
        { key: `bonnetjes/${hex("a")}.jpg`, sizeBytes: 1, lastModified: old },
        { key: "uploads/oude-naam.jpg", sizeBytes: 1, lastModified: old },
      ],
      referencedStems: new Set(),
      existing: [],
      now: NOW,
    });
    expect(plan.checked).toBe(0);
    expect(plan.unrecognised).toBe(1);
    expect(plan.newOrphans).toEqual([]);
  });

  it("geeft een wees vrij zodra er weer naar verwezen wordt, of wanneer hij weg is", () => {
    const plan = planCleanup({
      objects: [{ key: `pdfs/${hex("a")}.pdf`, sizeBytes: 1, lastModified: old }],
      referencedStems: new Set([`pdfs/${hex("a")}`]),
      existing: [
        { key: `pdfs/${hex("a")}.pdf`, sizeBytes: 1, firstSeenAt: daysAgo(40) },
        { key: `pdfs/${hex("b")}.pdf`, sizeBytes: 1, firstSeenAt: daysAgo(10) },
      ],
      now: NOW,
    });
    expect(plan.released.sort()).toEqual([`pdfs/${hex("a")}.pdf`, `pdfs/${hex("b")}.pdf`]);
    expect(plan.due).toEqual([]);
  });

  it("is pas na de volle wachttijd aan de beurt, de oudste eerst", () => {
    const objects = ["a", "b", "c"].map((c) => ({ key: `pdfs/${hex(c)}.pdf`, sizeBytes: 1, lastModified: daysAgo(90) }));
    const plan = planCleanup({
      objects,
      referencedStems: new Set([`images/${hex("f")}`]),
      existing: [
        { key: `pdfs/${hex("a")}.pdf`, sizeBytes: 1, firstSeenAt: daysAgo(GRACE_DAYS + 1) },
        { key: `pdfs/${hex("b")}.pdf`, sizeBytes: 1, firstSeenAt: daysAgo(GRACE_DAYS + 5) },
        { key: `pdfs/${hex("c")}.pdf`, sizeBytes: 1, firstSeenAt: daysAgo(GRACE_DAYS - 1) },
      ],
      now: NOW,
    });
    expect(plan.due.map((row) => row.key)).toEqual([`pdfs/${hex("b")}.pdf`, `pdfs/${hex("a")}.pdf`]);
    expect(plan.newOrphans).toEqual([]);
  });
});

describe("een ronde uitvoeren", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings = new Map();
    mocks.orphans = [];
    mocks.scannedSql = [];
    mocks.columns = [
      { table_name: "Page", column_name: "contentNl" },
      { table_name: "Page", column_name: "imageKey" },
      { table_name: "StorageOrphan", column_name: "key" },
    ];
    mocks.stemsByTable = new Map([
      ["Page", [`images/${hex("f")}`]],
      // Zou alles als verwezen markeren als de scan deze tabel meenam.
      ["StorageOrphan", [`pdfs/${hex("a")}`, `pdfs/${hex("b")}`]],
    ]);
    mocks.objects = [
      { key: `images/${hex("f")}.jpg`, sizeBytes: 10, lastModified: daysAgo(90) },
      { key: `pdfs/${hex("a")}.pdf`, sizeBytes: 100, lastModified: daysAgo(90) },
      { key: `pdfs/${hex("b")}.pdf`, sizeBytes: 200, lastModified: daysAgo(90) },
    ];
  });

  it("doorzoekt de weestabel zelf niet", async () => {
    await runStorageCleanup({ now: NOW, trigger: "manual", allowDelete: false });
    expect(mocks.scannedSql.some((sql) => sql.includes('"StorageOrphan"'))).toBe(false);
    expect(mocks.orphans.map((row) => row.key).sort()).toEqual([`pdfs/${hex("a")}.pdf`, `pdfs/${hex("b")}.pdf`]);
  });

  it("verwijdert niets zolang het verwijderen uit staat, ook niet wat vervallen is", async () => {
    mocks.orphans = [{ key: `pdfs/${hex("a")}.pdf`, sizeBytes: 100, firstSeenAt: daysAgo(GRACE_DAYS + 1) }];
    const summary = await runStorageCleanup({ now: NOW, trigger: "nightly", allowDelete: true });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ status: "ok", deleted: 0, due: 1, orphans: 2 });
  });

  it("een scan met de hand verwijdert nooit, ook niet met het verwijderen aan", async () => {
    mocks.settings.set(CLEANUP_SETTING_KEY, { deleteEnabled: true });
    mocks.orphans = [{ key: `pdfs/${hex("a")}.pdf`, sizeBytes: 100, firstSeenAt: daysAgo(GRACE_DAYS + 1) }];
    await runStorageCleanup({ now: NOW, trigger: "manual", allowDelete: false });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("verwijdert met het verwijderen aan enkel wat zijn wachttijd uit heeft", async () => {
    mocks.settings.set(CLEANUP_SETTING_KEY, { deleteEnabled: true });
    mocks.orphans = [
      { key: `pdfs/${hex("a")}.pdf`, sizeBytes: 100, firstSeenAt: daysAgo(GRACE_DAYS + 1) },
      { key: `pdfs/${hex("b")}.pdf`, sizeBytes: 200, firstSeenAt: daysAgo(3) },
    ];
    const summary = await runStorageCleanup({ now: NOW, trigger: "nightly", allowDelete: true });
    expect(mocks.deleteObject.mock.calls.map(([key]) => key)).toEqual([`pdfs/${hex("a")}.pdf`]);
    expect(mocks.orphans.map((row) => row.key)).toEqual([`pdfs/${hex("b")}.pdf`]);
    expect(summary).toMatchObject({ status: "ok", deleted: 1, deletedBytes: 100, orphans: 1, orphanBytes: 200 });
    expect(mocks.logSystemAudit).toHaveBeenCalledTimes(1);
  });

  it("verwijdert hoogstens het plafond per nacht", async () => {
    mocks.settings.set(CLEANUP_SETTING_KEY, { deleteEnabled: true });
    const many = Array.from({ length: MAX_DELETES_PER_RUN + 5 }, (_, i) => `pdfs/${i.toString(16).padStart(24, "0")}.pdf`);
    mocks.objects = [
      { key: `images/${hex("f")}.jpg`, sizeBytes: 10, lastModified: daysAgo(90) },
      ...many.map((key) => ({ key, sizeBytes: 1, lastModified: daysAgo(90) })),
    ];
    mocks.orphans = many.map((key) => ({ key, sizeBytes: 1, firstSeenAt: daysAgo(GRACE_DAYS + 1) }));
    const summary = await runStorageCleanup({ now: NOW, trigger: "nightly", allowDelete: true });
    expect(mocks.deleteObject).toHaveBeenCalledTimes(MAX_DELETES_PER_RUN);
    expect(summary).toMatchObject({ deleted: MAX_DELETES_PER_RUN, due: 5 });
  });

  it("weigert te markeren wanneer de scan geen enkele verwijzing vindt", async () => {
    mocks.stemsByTable = new Map();
    await expect(runStorageCleanup({ now: NOW, trigger: "nightly", allowDelete: true })).rejects.toThrow(
      /no references at all/,
    );
    expect(mocks.orphans).toEqual([]);
    expect(mocks.settings.get("storage.cleanup.state")).toMatchObject({
      lastRun: { status: "failed", error: expect.stringMatching(/^Searching the database failed: /) },
    });
  });

  it("houdt de cijfers van de laatste geslaagde ronde bij wanneer een ronde faalt", async () => {
    await runStorageCleanup({ now: NOW, trigger: "manual", allowDelete: false });
    mocks.stemsByTable = new Map();
    await expect(runStorageCleanup({ now: NOW, trigger: "manual", allowDelete: false })).rejects.toThrow();
    expect(mocks.settings.get("storage.cleanup.state")).toMatchObject({
      lastRun: { status: "failed" },
      lastOk: { status: "ok", orphans: 2 },
    });
  });

  it("de nachtelijke ronde draait één keer per Brusselse dag, vanaf 3u", async () => {
    // 01:30 in Brussel (winteruur, UTC+1).
    expect(await runNightlyStorageCleanup(new Date("2026-11-04T00:30:00Z"))).toEqual({ skipped: "before-03:00" });
    const first = await runNightlyStorageCleanup(new Date("2026-11-04T02:05:00Z"));
    expect(first).toMatchObject({ status: "ok", trigger: "nightly" });
    expect(await runNightlyStorageCleanup(new Date("2026-11-04T02:10:00Z"))).toEqual({ skipped: "done-today" });
  });

  it("bewaart geen enkele key in de toestand, want die tabel wordt ook doorzocht", async () => {
    await runStorageCleanup({ now: NOW, trigger: "manual", allowDelete: false });
    const state = JSON.stringify(mocks.settings.get("storage.cleanup.state"));
    expect(extractReferencedStems(state).size).toBe(0);
  });
});
