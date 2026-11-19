import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  shiftCreate: vi.fn(),
  shiftFindMany: vi.fn(),
  calendarEventFindMany: vi.fn(),
  calendarEventFindUnique: vi.fn(),
  logSystemAudit: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    shift: {
      create: mocks.shiftCreate,
      findMany: mocks.shiftFindMany,
    },
    calendarEvent: {
      findMany: mocks.calendarEventFindMany,
      findUnique: mocks.calendarEventFindUnique,
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logSystemAudit: mocks.logSystemAudit }));

import { createMcpRecord } from "@/lib/mcp/create";
import { getCalendarEvent, listCalendarEvents } from "@/lib/mcp/data";
import { principalFromAuthInfo } from "@/lib/mcp/policy";
import { adminRead } from "@/lib/mcp/read";

function makePrincipal(options: {
  permissions: string[];
  groupCodes?: string[];
  allGroups?: boolean;
}) {
  return principalFromAuthInfo({
    token: "[redacted]",
    clientId: "test-client",
    scopes: ["mcp:read", "mcp:create"],
    extra: {
      authKind: "static",
      permissions: options.permissions,
      allPermissions: false,
      groupCodes: options.groupCodes ?? [],
      allGroups: options.allGroups ?? false,
      roleCodes: [],
    },
  });
}

describe("MCP scoping voor shiften en kalender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shiftCreate.mockResolvedValue({ id: "shift-1", name: "Tapshift" });
    mocks.shiftFindMany.mockResolvedValue([]);
    mocks.calendarEventFindMany.mockResolvedValue([]);
  });

  it("eist een eigen post bij shift-creatie met alleen shift.edit", async () => {
    const shiftData = {
      name: "Tapshift",
      startTime: "2026-10-01T18:00:00+02:00",
      endTime: "2026-10-01T20:00:00+02:00",
      location: "'t ElixIr",
      description: "Tappen",
      maxParticipants: 2,
      reward: 1,
    };

    const editor = makePrincipal({ permissions: ["shift.edit"], groupCodes: ["FEEST"] });

    await expect(
      createMcpRecord(editor, { kind: "shift", data: shiftData }),
    ).rejects.toThrow(/post is verplicht/);

    await expect(
      createMcpRecord(editor, { kind: "shift", data: { ...shiftData, post: "CULTUUR" } }),
    ).rejects.toThrow(/Geen toegang tot groep CULTUUR/);

    await createMcpRecord(editor, { kind: "shift", data: { ...shiftData, post: "FEEST" } });
    expect(mocks.shiftCreate).toHaveBeenCalledTimes(1);

    const editAll = makePrincipal({ permissions: ["shift.editAll"] });
    await createMcpRecord(editAll, { kind: "shift", data: shiftData });
    expect(mocks.shiftCreate).toHaveBeenCalledTimes(2);
  });

  it("filtert shifts op groupCodes tenzij shift.editAll, shift.reward of allGroups geldt", async () => {
    const editor = makePrincipal({ permissions: ["shift.edit"], groupCodes: ["FEEST"] });
    await adminRead(editor, { resource: "shifts" });
    expect(mocks.shiftFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ post: { in: ["FEEST"] } }),
      }),
    );

    const rewardViewer = makePrincipal({ permissions: ["shift.reward"], groupCodes: ["FEEST"] });
    await adminRead(rewardViewer, { resource: "shifts" });
    expect(mocks.shiftFindMany.mock.calls[1]?.[0]?.where).not.toHaveProperty("post");
  });

  it("verbergt concept-kalenderevents van andere groepen bij calendar.create zonder calendar.manageAll", async () => {
    const creator = makePrincipal({ permissions: ["calendar.create"], groupCodes: ["CULTUUR"] });

    await listCalendarEvents({}, creator);
    expect(mocks.calendarEventFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { publishedAt: { not: null } },
                { group: { code: { in: ["CULTUUR"] } } },
              ],
            },
          ],
        }),
      }),
    );

    const otherDraft = {
      id: "evt-other-draft",
      titleNl: "Geheim",
      titleEn: null,
      descriptionNl: null,
      descriptionEn: null,
      location: null,
      start: new Date("2026-10-01T18:00:00Z"),
      end: new Date("2026-10-01T20:00:00Z"),
      allDay: false,
      url: null,
      imageKey: null,
      organiserName: null,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      group: { code: "FEEST", slug: "feest", nameNl: "Feest", nameEn: "Party" },
      categories: [],
    };
    mocks.calendarEventFindUnique.mockResolvedValueOnce(otherDraft);
    await expect(getCalendarEvent({ id: "evt-other-draft" }, creator)).rejects.toThrow(/Geen toegang/);

    mocks.calendarEventFindUnique.mockResolvedValueOnce({ ...otherDraft, publishedAt: new Date() });
    await expect(getCalendarEvent({ id: "evt-other-draft" }, creator)).resolves.toHaveProperty("item.id", "evt-other-draft");

    const manager = makePrincipal({ permissions: ["calendar.manageAll"] });
    mocks.calendarEventFindUnique.mockResolvedValueOnce(otherDraft);
    await expect(getCalendarEvent({ id: "evt-other-draft" }, manager)).resolves.toHaveProperty("item.id", "evt-other-draft");
  });
});
