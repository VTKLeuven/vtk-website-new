import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  logAudit: vi.fn(),
  pocFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  pocRepresentativeUpsert: vi.fn(),
  pocRepresentativeDelete: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/session", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@vtk/db", () => ({
  prisma: {
    poc: { findUnique: mocks.pocFindUnique },
    user: { findFirst: mocks.userFindFirst },
    pocRepresentative: {
      upsert: mocks.pocRepresentativeUpsert,
      delete: mocks.pocRepresentativeDelete,
    },
  },
}));

import { addPocRepresentativeAction } from "@/app/actions/pocs-partners";

describe("addPocRepresentativeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pocFindUnique.mockResolvedValue({ id: "poc_1", nameNl: "Computerwetenschappen" });
    mocks.userFindFirst.mockResolvedValue({ id: "user_1", name: "Zoë Sabbe" });
    mocks.pocRepresentativeUpsert.mockResolvedValue({ id: "rep_1" });
  });

  it("weigert een lege userId met een duidelijke fout zonder DB upsert", async () => {
    const form = new FormData();
    form.set("pocId", "poc_1");
    form.set("userId", "");

    await expect(addPocRepresentativeAction(form)).rejects.toThrow();
    expect(mocks.pocRepresentativeUpsert).not.toHaveBeenCalled();
  });

  it("weigert wanneer het lid niet bestaat of inactief is", async () => {
    mocks.userFindFirst.mockResolvedValue(null);

    const form = new FormData();
    form.set("pocId", "poc_1");
    form.set("userId", "non_existent");

    await expect(addPocRepresentativeAction(form)).rejects.toThrow(/Lid niet gevonden of inactief/);
    expect(mocks.pocRepresentativeUpsert).not.toHaveBeenCalled();
  });

  it("voegt een geldige vertegenwoordiger toe en schrijft audit log", async () => {
    const form = new FormData();
    form.set("pocId", "poc_1");
    form.set("userId", "user_1");
    form.set("year", "2026");

    await addPocRepresentativeAction(form);

    expect(mocks.pocRepresentativeUpsert).toHaveBeenCalledWith({
      where: {
        pocId_userId_year: {
          pocId: "poc_1",
          userId: "user_1",
          year: 2026,
        },
      },
      update: { order: 0 },
      create: {
        pocId: "poc_1",
        userId: "user_1",
        year: 2026,
        order: 0,
      },
    });

    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: "create",
      entity: "poc",
      entityId: "poc_1",
      target: "Computerwetenschappen",
      summary: "Zoë Sabbe toegevoegd als vertegenwoordiger",
    });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pocs");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/pocs");
  });
});
