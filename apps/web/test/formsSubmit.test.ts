import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { saveFormEntry, type SubmitInput } from "@/lib/forms/submit";

const input: SubmitInput = {
  formId: "form-1",
  entryId: "entry-1",
  submittedById: null,
  submitterName: "Jan",
  submitterEmail: "jan@example.com",
  locale: "NL",
  isTest: false,
  requestFingerprint: null,
  answers: [],
  uploads: [],
  claimedOptions: ["nieuw"],
  asDraft: false,
  maxEntries: null,
  allowWaitlist: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("quota bij het bewerken van een inzending", () => {
  it("houdt de vorige plaats wanneer de nieuwe keuze intussen vol zit", async () => {
    // De bewerking geeft eerst de oude plaats terug. Zonder rollback blijft de
    // oude inzending bestaan terwijl haar quotum stil met één verlaagd is.
    const quota = { oud: 1, nieuw: 1 };
    const updateEntry = vi.fn();
    const tx = {
      formEntry: {
        findFirst: vi.fn().mockResolvedValue({
          id: "entry-1",
          status: "SUBMITTED",
          waitlisted: false,
          submittedAt: new Date("2026-08-10T10:00:00Z"),
          waitlistedAt: null,
          answers: [{ valueOptions: ["oud"] }],
        }),
        update: updateEntry,
        create: vi.fn(),
        count: vi.fn(),
      },
      formFieldOption: {
        findMany: vi.fn().mockResolvedValue([
          { id: "opt-nieuw", quotaLimit: 1, allowWaitlist: false },
        ]),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: {
              id?: string;
              code?: string;
              quotaUsed?: { gt?: number; lt?: number };
            };
            data: { quotaUsed: { decrement?: number; increment?: number } };
          }) => {
            const key = where.id === "opt-nieuw" ? "nieuw" : where.code === "oud" ? "oud" : null;
            if (!key) return { count: 0 };
            if (data.quotaUsed.decrement) {
              quota[key] -= data.quotaUsed.decrement;
              return { count: 1 };
            }
            if (data.quotaUsed.increment && quota[key] < 1) {
              quota[key] += data.quotaUsed.increment;
              return { count: 1 };
            }
            return { count: 0 };
          }
        ),
      },
      formAnswer: { deleteMany: vi.fn(), create: vi.fn() },
      formFileUpload: { createMany: vi.fn() },
    };

    mocks.transaction.mockImplementation(async (run) => {
      const before = { ...quota };
      try {
        return await run(tx);
      } catch (error) {
        quota.oud = before.oud;
        quota.nieuw = before.nieuw;
        throw error;
      }
    });

    await expect(saveFormEntry(input)).resolves.toEqual({
      ok: false,
      code: "OPTION_FULL",
      option: "nieuw",
    });
    expect(quota).toEqual({ oud: 1, nieuw: 1 });
    expect(updateEntry).not.toHaveBeenCalled();
  });
});
