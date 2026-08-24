import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pushberichten versturen.
 *
 * De twee dingen die hier vastliggen zijn de twee dingen die stil kunnen
 * misgaan: een token dat Expo afkeurt hoort opgeruimd te worden (anders groeit
 * de tabel met tokens die nooit meer iets doen), en een storing bij Expo mag
 * nooit doorgegooid worden naar de beller. Een pushbericht is nooit de kern van
 * wat er aan het gebeuren was.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    appPushDevice: { findMany: mocks.findMany, deleteMany: mocks.deleteMany },
  },
}));

import { sendPushToUsers } from "@/lib/app-api/push";

const MESSAGE = { title: "Je broodje ligt klaar", body: "Tot 16u aan het Theokot." };

function tokens(...values: string[]) {
  return values.map((token) => ({ token }));
}

describe("pushberichten versturen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stuurt niets wanneer er niemand is", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(await sendPushToUsers([], MESSAGE)).toEqual({ sent: 0, removed: 0, failed: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stuurt niets wanneer niemand van hen een toestel heeft", async () => {
    mocks.findMany.mockResolvedValue([]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(await sendPushToUsers(["user-1"], MESSAGE)).toEqual({ sent: 0, removed: 0, failed: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("telt wat er aankwam", async () => {
    mocks.findMany.mockResolvedValue(tokens("ExponentPushToken[a]", "ExponentPushToken[b]"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ status: "ok" }, { status: "ok" }] }), { status: 200 }),
    );

    expect(await sendPushToUsers(["user-1"], MESSAGE)).toEqual({ sent: 2, removed: 0, failed: 0 });
  });

  /**
   * `DeviceNotRegistered` is het enige moment waarop we horen dat de app van een
   * toestel verdwenen is. Wordt daar niets mee gedaan, dan blijft dat token
   * eeuwig meegestuurd worden.
   */
  it("ruimt een token op dat Expo niet meer kent", async () => {
    mocks.findMany.mockResolvedValue(tokens("ExponentPushToken[a]", "ExponentPushToken[dood]"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { status: "ok" },
            { status: "error", details: { error: "DeviceNotRegistered" } },
          ],
        }),
        { status: 200 },
      ),
    );

    expect(await sendPushToUsers(["user-1"], MESSAGE)).toEqual({ sent: 1, removed: 1, failed: 0 });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ["ExponentPushToken[dood]"] } },
    });
  });

  it("ruimt niets op bij een andere fout", async () => {
    mocks.findMany.mockResolvedValue(tokens("ExponentPushToken[a]"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ status: "error", details: { error: "MessageTooBig" } }] }),
        { status: 200 },
      ),
    );

    expect(await sendPushToUsers(["user-1"], MESSAGE)).toEqual({ sent: 0, removed: 0, failed: 1 });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("gooit niet wanneer Expo onbereikbaar is", async () => {
    mocks.findMany.mockResolvedValue(tokens("ExponentPushToken[a]"));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    expect(await sendPushToUsers(["user-1"], MESSAGE)).toEqual({ sent: 0, removed: 0, failed: 1 });
  });

  it("splitst in stukken van honderd", async () => {
    mocks.findMany.mockResolvedValue(
      Array.from({ length: 150 }, (_, index) => ({ token: `ExponentPushToken[${index}]` })),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body)) as unknown[];
      return new Response(JSON.stringify({ data: body.map(() => ({ status: "ok" })) }), {
        status: 200,
      });
    });

    expect(await sendPushToUsers(["user-1"], MESSAGE)).toEqual({ sent: 150, removed: 0, failed: 0 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
