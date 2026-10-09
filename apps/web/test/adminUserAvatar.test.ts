import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  putObject: vi.fn(),
  deleteObject: vi.fn(),
  revalidatePath: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@vtk/db", () => ({
  prisma: {
    user: { findFirst: mocks.findFirst, update: mocks.update },
  },
}));
vi.mock("@/lib/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit, describeChanges: () => null }));
vi.mock("@vtk/storage", () => ({
  putObject: mocks.putObject,
  deleteObject: mocks.deleteObject,
  newStorageKey: (prefix: string) => "avatars/" + prefix + "-test",
}));
vi.mock("@/app/actions/onboarding", () => ({
  MAX_AVATAR_BYTES: 8 * 1024 * 1024,
  // De echte storeAvatar draait sharp en S3; hier alleen de upload simuleren.
  storeAvatar: vi.fn(async (file: File | null) => {
    if (!file || file.size === 0) return null;
    mocks.putObject("avatars/avatar-test.jpg");
    return "avatars/avatar-test.jpg";
  }),
}));

import { removeUserAvatarAction, updateUserAvatarAction } from "@/app/actions/users-groups";
import { SAVE_IDLE } from "@/lib/saveState";

function session(isSuperAdmin = false) {
  return {
    token: "t",
    expiresAt: new Date(0).toISOString(),
    user: { id: "beheerder", email: "beheerder@vtk.be", isSuperAdmin, onboarded: true },
    permissions: ["users.edit"],
  };
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "lid",
    name: "Lid",
    avatarKey: null,
    isSuperAdmin: false,
    ...overrides,
  };
}

describe("updateUserAvatarAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // De echte deleteObject is async; .catch() in de action vraagt een Promise.
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.requirePermission.mockResolvedValue(session());
    mocks.findFirst.mockResolvedValue(user({ avatarKey: "avatars/old.jpg" }));
    mocks.update.mockResolvedValue(user());
  });

  it("vereist users.edit en vervangt de foto van een lid", async () => {
    const form = new FormData();
    form.set("id", "lid");
    form.append("photo", new File(["x"], "nieuwe.jpg", { type: "image/jpeg" }));

    const result = await updateUserAvatarAction(SAVE_IDLE, form);

    expect(mocks.requirePermission).toHaveBeenCalledWith("users.edit");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "lid" },
      data: { avatarKey: "avatars/avatar-test.jpg" },
    });
    expect(mocks.deleteObject).toHaveBeenCalledWith("avatars/old.jpg");
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "update", entity: "user", entityId: "lid" }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/gebruikers/lid");
    expect(result.status).toBe("success");
  });

  it("weigert het account van een superadmin voor een niet-superadmin", async () => {
    mocks.findFirst.mockResolvedValue(user({ isSuperAdmin: true }));
    const form = new FormData();
    form.set("id", "lid");
    form.append("photo", new File(["x"], "nieuwe.jpg", { type: "image/jpeg" }));

    const result = await updateUserAvatarAction(SAVE_IDLE, form);

    expect(result).toMatchObject({ status: "error", code: "FORBIDDEN" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("laat een superadmin de foto van een superadmin wijzigen", async () => {
    mocks.requirePermission.mockResolvedValue(session(true));
    mocks.findFirst.mockResolvedValue(user({ isSuperAdmin: true }));
    const form = new FormData();
    form.set("id", "lid");
    form.append("photo", new File(["x"], "nieuwe.jpg", { type: "image/jpeg" }));

    const result = await updateUserAvatarAction(SAVE_IDLE, form);

    expect(result.status).toBe("success");
  });

  it("meld AVATAR_REQUIRED wanneer er geen foto meegaat", async () => {
    const form = new FormData();
    form.set("id", "lid");

    const result = await updateUserAvatarAction(SAVE_IDLE, form);

    expect(result).toMatchObject({ status: "error", code: "AVATAR_REQUIRED" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("meld AVATAR_TOO_LARGE bij een te grote foto, zonder opslag", async () => {
    const big = new File(["x".repeat(8 * 1024 * 1024 + 1)], "groot.jpg", { type: "image/jpeg" });
    const form = new FormData();
    form.set("id", "lid");
    form.append("photo", big);

    const result = await updateUserAvatarAction(SAVE_IDLE, form);

    expect(result).toMatchObject({ status: "error", code: "AVATAR_TOO_LARGE" });
    expect(mocks.putObject).not.toHaveBeenCalled();
  });

  it("meld AVATAR_FAILED wanneer de verwerking mislukt", async () => {
    const { storeAvatar } = await import("@/app/actions/onboarding");
    vi.mocked(storeAvatar).mockRejectedValueOnce(new Error("kapot"));
    const form = new FormData();
    form.set("id", "lid");
    form.append("photo", new File(["x"], "kapot.jpg", { type: "image/jpeg" }));

    const result = await updateUserAvatarAction(SAVE_IDLE, form);

    expect(result).toMatchObject({ status: "error", code: "AVATAR_FAILED" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("meld ACCOUNT_NOT_FOUND bij een onbekende of gewiste gebruiker", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const form = new FormData();
    form.set("id", "niet_bestand");
    form.append("photo", new File(["x"], "nieuwe.jpg", { type: "image/jpeg" }));

    const result = await updateUserAvatarAction(SAVE_IDLE, form);

    expect(result).toMatchObject({ status: "error", code: "ACCOUNT_NOT_FOUND" });
  });
});

describe("removeUserAvatarAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.requirePermission.mockResolvedValue(session());
    mocks.findFirst.mockResolvedValue(user({ avatarKey: "avatars/old.jpg" }));
    mocks.update.mockResolvedValue(user());
  });

  it("verwijdert eerst het object en zet daarna de kolom leeg", async () => {
    const order: string[] = [];
    mocks.deleteObject.mockImplementation(async () => {
      order.push("delete");
    });
    mocks.update.mockImplementation(async () => {
      order.push("update");
    });

    const form = new FormData();
    form.set("id", "lid");
    const result = await removeUserAvatarAction(form);

    expect(result.status).toBe("success");
    expect(order).toEqual(["delete", "update"]);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "lid" }, data: { avatarKey: null } });
  });

  it("meld STORAGE_UNAVAILABLE wanneer de opslag niet antwoordt", async () => {
    mocks.deleteObject.mockRejectedValue(new Error("ECONNREFUSED"));

    const form = new FormData();
    form.set("id", "lid");
    const result = await removeUserAvatarAction(form);

    expect(result).toMatchObject({ status: "error", code: "STORAGE_UNAVAILABLE" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("is een no-op wanneer het lid geen foto heeft", async () => {
    mocks.findFirst.mockResolvedValue(user({ avatarKey: null }));

    const form = new FormData();
    form.set("id", "lid");
    const result = await removeUserAvatarAction(form);

    expect(result.status).toBe("success");
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("weigert de foto van een superadmin voor een niet-superadmin", async () => {
    mocks.findFirst.mockResolvedValue(user({ isSuperAdmin: true }));

    const form = new FormData();
    form.set("id", "lid");
    const result = await removeUserAvatarAction(form);

    expect(result).toMatchObject({ status: "error", code: "FORBIDDEN" });
  });
});
