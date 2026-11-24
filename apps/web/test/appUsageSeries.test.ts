import { describe, expect, it } from "vitest";

import { appPlanningOperationSchema, appUsageReportSchema } from "@/lib/app-api/schemas";
import { cohortTable, fill, mondayOf, seriesKeys } from "@/lib/app-usage-series";

describe("seriesKeys", () => {
  it("geeft elke dag, ook over de zomeruurwissel", () => {
    expect(seriesKeys("2026-10-24", "2026-10-27", "day")).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
  });

  it("geeft per week de maandag, van de week van het begin tot die van het einde", () => {
    expect(seriesKeys("2026-11-04", "2026-11-17", "week")).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
  });

  it("vindt de maandag van een zondag", () => {
    expect(mondayOf("2026-11-22")).toBe("2026-11-16");
  });
});

describe("fill", () => {
  it("zet 0 waar er niets was", () => {
    expect(fill(["a", "b", "c"], [{ key: "b", value: 4 }])).toEqual([0, 4, 0]);
  });
});

describe("cohortTable", () => {
  it("rekent het aandeel per week uit en laat weken die nog moeten komen leeg", () => {
    const rows = cohortTable(
      [{ week: "2026-11-09", size: 4 }],
      [
        { week: "2026-11-09", offset: 0, installs: 4 },
        { week: "2026-11-09", offset: 1, installs: 2 },
      ],
      4,
      "2026-11-23",
    );
    expect(rows[0]!.shares).toEqual([1, 0.5, 0, null]);
  });
});

describe("appUsageReportSchema", () => {
  const report = {
    installId: "0f8fad5b-d9cb-469f-a165-70867728950e",
    platform: "ios",
    osVersion: "18.1",
    deviceModel: null,
    appVersion: "1.2.0",
    runtimeVersion: "exposdk:58.0.0",
    updateId: null,
    channel: "preview",
    expoGo: false,
    locale: "nl",
    pushEnabled: null,
    sessionId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    sessionStartedAt: "2026-11-24T12:00:00.000Z",
    activeSeconds: 42,
    screens: [{ screen: "evenement/[id]", tab: "(home)", views: 2 }],
    events: [{ kind: "push_open", at: "2026-11-24T12:00:01.000Z" }],
  };

  it("aanvaardt een rapport van de app", () => {
    expect(appUsageReportSchema.parse(report).screens).toHaveLength(1);
  });

  it("laat een onzinnig scherm vallen in plaats van het hele rapport te weigeren", () => {
    const parsed = appUsageReportSchema.parse({ ...report, screens: "kapot", activeSeconds: -5 });
    expect(parsed.screens).toEqual([]);
    expect(parsed.activeSeconds).toBe(0);
  });

  it("weigert een installatie-id met vreemde tekens", () => {
    expect(() => appUsageReportSchema.parse({ ...report, installId: "x'; drop" })).toThrow();
  });
});

describe("appPlanningOperationSchema, blokkalender", () => {
  it("aanvaardt een examen en een taak met enkel een vak", () => {
    expect(appPlanningOperationSchema.parse({ op: "addExam", exam: { subject: "course:12", date: "2027-01-08", time: "09:00" } }).op).toBe("addExam");
    expect(appPlanningOperationSchema.parse({ op: "addTask", task: { date: "2027-01-02", subject: "name:Thermo", title: "" } }).op).toBe("addTask");
  });

  it("weigert een taak zonder vak en zonder titel", () => {
    expect(() => appPlanningOperationSchema.parse({ op: "addTask", task: { date: "2027-01-02", subject: null, title: " " } })).toThrow();
  });
});

describe("appPlanningOperationSchema, privé items", () => {
  const item = { title: "Tandarts", location: "Naamsestraat 1", note: "", date: "2026-12-02", allDay: false, start: "14:00", end: "15:00" };

  it("aanvaardt een item met een begin en een einde, en een hele dag zonder uren", () => {
    expect(appPlanningOperationSchema.parse({ op: "addPersonal", item }).op).toBe("addPersonal");
    expect(
      appPlanningOperationSchema.parse({ op: "addPersonal", item: { ...item, allDay: true, start: null, end: null } }).op,
    ).toBe("addPersonal");
    expect(appPlanningOperationSchema.parse({ op: "updatePersonal", id: "abc", item: { ...item, end: "24:00" } }).op).toBe(
      "updatePersonal",
    );
  });

  it("weigert een einde voor het begin en een item zonder titel", () => {
    expect(() => appPlanningOperationSchema.parse({ op: "addPersonal", item: { ...item, end: "13:00" } })).toThrow();
    expect(() => appPlanningOperationSchema.parse({ op: "addPersonal", item: { ...item, title: "  " } })).toThrow();
  });
});
