import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  pocs: vi.fn(),
  linked: vi.fn(),
  account: vi.fn(),
  updateUser: vi.fn(),
  upsertSetting: vi.fn(),
  deleteSetting: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@vtk/db", () => ({
  prisma: {
    poc: { findMany: mocks.pocs },
    user: { findMany: mocks.linked, findUnique: mocks.account, update: mocks.updateUser },
    setting: { upsert: mocks.upsertSetting, deleteMany: mocks.deleteSetting },
  },
}));

import { syncPocDiscordRoles } from "@/lib/discord/pocAccess";
import { handlePollInteraction } from "@/lib/discord/pollInteractions";
import { DISCORD_LINK_PANEL_ID } from "@/lib/discord/pollMessages";
import { currentStudyYear } from "@/lib/workingYear";

const now = new Date("2026-11-09T12:00:00.000Z");
const confirmedYear = currentStudyYear(now);

function account(over: Record<string, unknown> = {}) {
  return {
    id: "u1",
    discordId: "d1",
    discordRoleIds: [] as string[],
    active: true,
    deletedAt: null,
    isStudent: true,
    studyConfirmedYear: confirmedYear,
    studyProgrammes: ["COMPUTER_SCIENCE"],
    ...over,
  };
}

/** Elke oproep naar Discord, en wat Discord daarop antwoordt. */
const calls: string[] = [];
let status = 204;

beforeEach(() => {
  vi.useFakeTimers({ now, toFake: ["Date"] });
  vi.stubEnv("DISCORD_BOT_TOKEN", "token");
  vi.stubEnv("DISCORD_PUBLIC_KEY", "key");
  vi.stubEnv("DISCORD_GUILD_ID", "guild");
  calls.length = 0;
  status = 204;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url.replace("https://discord.com/api/v10", "")}`);
      return new Response(status === 204 ? null : "{}", { status });
    }),
  );
  mocks.pocs.mockResolvedValue([
    { nameNl: "POC Computerwetenschappen", discordRoleId: "cw", studyProgrammes: ["COMPUTER_SCIENCE"] },
    { nameNl: "POC Werktuigkunde", discordRoleId: "wtk", studyProgrammes: ["MECHANICAL"] },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("syncPocDiscordRoles", () => {
  it("geeft wat ontbreekt, neemt af wat niet meer past en onthoudt het", async () => {
    mocks.linked.mockResolvedValue([account({ discordRoleIds: ["wtk"] })]);

    await expect(syncPocDiscordRoles(now)).resolves.toEqual({ changed: 1, waiting: 0 });

    expect(calls).toEqual(["PUT /guilds/guild/members/d1/roles/cw", "DELETE /guilds/guild/members/d1/roles/wtk"]);
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: "u1" }, data: { discordRoleIds: { set: ["cw"] } } });
    expect(mocks.deleteSetting).toHaveBeenCalled();
  });

  it("vraagt Discord niets voor wie al klopt", async () => {
    mocks.linked.mockResolvedValue([account({ discordRoleIds: ["cw"] })]);

    await expect(syncPocDiscordRoles(now)).resolves.toEqual({ changed: 0, waiting: 0 });

    expect(calls).toEqual([]);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("neemt de rol af zolang de studie niet bevestigd is", async () => {
    mocks.linked.mockResolvedValue([account({ discordRoleIds: ["cw"], studyConfirmedYear: confirmedYear - 1 })]);

    await syncPocDiscordRoles(now);

    expect(calls).toEqual(["DELETE /guilds/guild/members/d1/roles/cw"]);
  });

  it("stopt bij 429 zonder fout, en onthoudt niets", async () => {
    status = 429;
    mocks.linked.mockResolvedValue([account(), account({ id: "u2", discordId: "d2" })]);

    await expect(syncPocDiscordRoles(now)).resolves.toEqual({ changed: 0, waiting: 2 });

    expect(calls).toHaveLength(1);
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.upsertSetting).not.toHaveBeenCalled();
  });

  it("zet een weigering op het scherm van het beheer", async () => {
    status = 403;
    mocks.linked.mockResolvedValue([account()]);

    await syncPocDiscordRoles(now);

    const saved = mocks.upsertSetting.mock.calls[0][0] as { update: { value: { message: string } } };
    expect(saved.update.value.message).toContain("Manage Roles");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.deleteSetting).not.toHaveBeenCalled();
  });

  it("blijft niet proberen voor wie de server verliet", async () => {
    status = 404;
    mocks.linked.mockResolvedValue([account()]);

    await expect(syncPocDiscordRoles(now)).resolves.toEqual({ changed: 1, waiting: 0 });

    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
  });

  it("doet niets zonder server-id", async () => {
    vi.stubEnv("DISCORD_GUILD_ID", "");

    await expect(syncPocDiscordRoles(now)).resolves.toEqual({ changed: 0, waiting: 0 });

    expect(mocks.linked).not.toHaveBeenCalled();
  });
});

describe("de knop onder het koppelbericht", () => {
  const click = (roles: string[] = []) =>
    handlePollInteraction({
      type: 3,
      data: { custom_id: DISCORD_LINK_PANEL_ID },
      member: { user: { id: "d1", username: "student" }, roles },
    });
  const content = (response: Awaited<ReturnType<typeof click>>) => ("data" in response ? String((response.data as { content?: string }).content) : "");

  it("stuurt wie nog niet gekoppeld is naar de site, en raakt geen rollen aan", async () => {
    mocks.account.mockResolvedValue(null);

    const response = await click();

    expect(JSON.stringify(response)).toContain("/koppel-discord?token=");
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("noemt de POC, en herstelt de rol zonder andere rollen aan te raken", async () => {
    mocks.account.mockResolvedValue(account({ discordRoleIds: ["cw"] }));

    const response = await click(["moderator"]);

    expect(content(response)).toContain("**Computerwetenschappen**");
    await (mocks.after.mock.calls[0][0] as () => Promise<void>)();
    expect(calls).toEqual(["PUT /guilds/guild/members/d1/roles/cw"]);
  });

  it("zegt het wanneer de studie nog bevestigd moet worden", async () => {
    mocks.account.mockResolvedValue(account({ studyConfirmedYear: confirmedYear - 1 }));

    expect(content(await click())).toContain("nog niet bevestigd");
  });

  it("zegt het wanneer geen enkele POC bij de richting past", async () => {
    mocks.account.mockResolvedValue(account({ studyProgrammes: ["ARCHITECTURE"] }));

    expect(content(await click())).toContain("geen richting met een POC-kanaal");
  });
});
