import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDoorShortcutToken,
  hashDoorShortcutToken,
} from "@/lib/door-shortcut";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  resolveUserHasPermission: vi.fn(),
  requestDoorOpen: vi.fn(),
  logDoorAccess: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    doorShortcutToken: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock("@/lib/door-server", () => ({
  resolveUserHasPermission: mocks.resolveUserHasPermission,
  requestDoorOpen: mocks.requestDoorOpen,
  logDoorAccess: mocks.logDoorAccess,
}));

import { POST } from "@/app/api/door/shortcut/open/route";

function request(token?: string) {
  return new Request("https://vtk.be/api/door/shortcut/open", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

const tokenRow = {
  id: "token_1",
  userId: "user_1",
  label: "Mijn iPhone",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  revokedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(tokenRow);
  mocks.resolveUserHasPermission.mockResolvedValue(true);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.requestDoorOpen.mockResolvedValue({ ok: true });
  mocks.logDoorAccess.mockResolvedValue(undefined);
});

describe("POST /api/door/shortcut/open", () => {
  it("rejects a missing or malformed Bearer token before touching the database", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("looks up only the token hash and rejects unknown tokens", async () => {
    const raw = createDoorShortcutToken();
    mocks.findUnique.mockResolvedValue(null);
    const response = await POST(request(raw));

    expect(response.status).toBe(401);
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { tokenHash: hashDoorShortcutToken(raw) },
    }));
    expect(mocks.resolveUserHasPermission).not.toHaveBeenCalled();
  });

  it("rejects a revoked token before checking permissions", async () => {
    mocks.findUnique.mockResolvedValue({ ...tokenRow, revokedAt: new Date() });
    const response = await POST(request(createDoorShortcutToken()));

    expect(response.status).toBe(401);
    expect(mocks.resolveUserHasPermission).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("checks door.remoteOpen live before claiming the cooldown", async () => {
    mocks.resolveUserHasPermission.mockResolvedValue(false);
    const response = await POST(request(createDoorShortcutToken()));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "forbidden" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.requestDoorOpen).not.toHaveBeenCalled();
  });

  it("rate-limits concurrent or repeated calls atomically", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const response = await POST(request(createDoorShortcutToken()));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(mocks.requestDoorOpen).not.toHaveBeenCalled();
  });

  it("reports Pi failures without writing a successful access log", async () => {
    mocks.requestDoorOpen.mockResolvedValue({ ok: false, error: "unreachable" });
    const response = await POST(request(createDoorShortcutToken()));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "unreachable" });
    expect(mocks.logDoorAccess).not.toHaveBeenCalled();
  });

  it("opens and logs the door against the token owner", async () => {
    const response = await POST(request(createDoorShortcutToken()));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.logDoorAccess).toHaveBeenCalledWith({
      method: "REMOTE",
      result: "ALLOWED",
      userId: "user_1",
      reason: "shortcut:Mijn iPhone",
    });
  });
});
