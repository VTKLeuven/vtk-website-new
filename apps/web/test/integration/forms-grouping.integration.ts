import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@vtk/db";
import type { FormFieldType } from "@prisma/client";

// Buiten Next is er geen cache om te verversen.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { runDueGroupings } = await import("@/lib/forms/grouping/due");
const { loadGroupingView } = await import("@/lib/forms/grouping/view");

/**
 * De groepjesmaker tegen een echte database: het automatisch sluiten zodra het
 * verwachte aantal personen binnen is, een groepsinschrijving die voor drie
 * telt, en een laatkomer die na de indeling niet stil in een groep belandt.
 */
describe.sequential("groepjesmaker", () => {
  const groupId = randomUUID();
  let formId = "";
  const fieldIds: Record<string, string> = {};

  async function entry(name: string, role: string, study: string, size?: number, others?: string) {
    await prisma.formEntry.create({
      data: {
        formId,
        status: "SUBMITTED",
        submittedAt: new Date(),
        answers: {
          create: [
            { fieldId: fieldIds.naam, fieldCode: "naam", valueText: name },
            { fieldId: fieldIds.rol, fieldCode: "rol", valueOptions: [role] },
            { fieldId: fieldIds.richting, fieldCode: "richting", valueOptions: [study] },
            ...(size
              ? [{ fieldId: fieldIds.aantal, fieldCode: "aantal", valueNumber: size }]
              : []),
            ...(others
              ? [{ fieldId: fieldIds.namen, fieldCode: "namen", valueText: others }]
              : []),
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.group.create({
      data: { id: groupId, code: `grp-${groupId}`, slug: `grp-${groupId}`, nameNl: "T", nameEn: "T" },
    });
    const form = await prisma.form.create({
      data: {
        slug: `groepjes-${groupId}`,
        ownerGroupId: groupId,
        titleNl: "Peter-meterinschrijving",
        status: "PUBLISHED",
      },
    });
    formId = form.id;

    const fields: [string, FormFieldType, string[]][] = [
      ["naam", "SHORT_TEXT", []],
      ["rol", "SINGLE_CHOICE", ["peter", "kind"]],
      ["aantal", "NUMBER", []],
      ["namen", "SHORT_TEXT", []],
      ["richting", "SINGLE_CHOICE", ["burgie", "archie"]],
    ];
    for (const [index, [code, type, options]] of fields.entries()) {
      const field = await prisma.formField.create({
        data: {
          formId,
          code,
          type,
          sortOrder: index,
          labelNl: code,
          options: {
            // formId komt uit de samengestelde relatie met het veld.
            create: options.map((option, order) => ({
              code: option,
              labelNl: option,
              sortOrder: order,
            })),
          },
        },
      });
      fieldIds[code] = field.id;
    }

    await prisma.formGrouping.create({
      data: {
        formId,
        minMembers: 7,
        maxMembers: 8,
        minAnchors: 2,
        maxAnchors: 3,
        autoRun: true,
        expectedPeople: 21,
        fields: {
          create: [
            { fieldId: fieldIds.naam, role: "NAME" },
            { fieldId: fieldIds.rol, role: "ANCHOR", options: ["peter"] },
            { fieldId: fieldIds.aantal, role: "GROUP_SIZE" },
            { fieldId: fieldIds.namen, role: "GROUP_NAMES" },
            { fieldId: fieldIds.richting, role: "SIMILAR", weight: 3 },
          ],
        },
      },
    });

    for (let index = 0; index < 7; index += 1) await entry(`Burgie ${index}`, "kind", "burgie");
    for (let index = 0; index < 6; index += 1) await entry(`Archie ${index}`, "kind", "archie");
    await entry("Peter team", "peter", "burgie", 3, "Anna, Bert");
    await entry("Meter 1", "peter", "archie");
    await entry("Meter 2", "peter", "archie");
  });

  afterAll(async () => {
    await prisma.form.deleteMany({ where: { id: formId } });
    await prisma.group.deleteMany({ where: { id: groupId } });
  });

  it("wacht zolang het verwachte aantal personen niet binnen is", async () => {
    // 13 kinderen + 3 peters (groepsinschrijving) + 2 meters = 18 van de 21.
    const outcomes = await runDueGroupings();
    expect(outcomes.find((outcome) => outcome.formId === formId)).toBeUndefined();
    const form = await prisma.form.findUniqueOrThrow({ where: { id: formId } });
    expect(form.status).toBe("PUBLISHED");
  });

  it("sluit en deelt in zodra iedereen er is", async () => {
    // Nog een groep van drie: 16 leden, dus twee groepen van 8.
    await entry("Laatste", "kind", "burgie", 3, "C, D");
    const outcomes = await runDueGroupings();
    expect(outcomes.find((outcome) => outcome.formId === formId)).toMatchObject({
      closed: true,
      groups: 2,
    });
    const form = await prisma.form.findUniqueOrThrow({ where: { id: formId } });
    expect(form.status).toBe("CLOSED");

    const view = await loadGroupingView(formId, "nl");
    expect(view.grouping?.warnings).toEqual([]);
    const groups = view.groups ?? [];
    expect(groups.map((group) => group.memberPeople).sort()).toEqual([8, 8]);
    for (const group of groups) {
      expect(group.anchorPeople).toBeGreaterThanOrEqual(2);
      expect(group.anchorPeople).toBeLessThanOrEqual(3);
    }
    // De peters die samen inschreven, zitten bij de burgies.
    const team = groups.find((group) => group.members.some((m) => m.name === "Peter team"));
    expect(team?.members.find((m) => m.name === "Peter team")?.companions).toEqual(["Anna", "Bert"]);
    expect(team?.profile[0].value).toMatch(/^burgie/);
  });

  it("deelt maar één keer automatisch in", async () => {
    await entry("Te laat", "kind", "archie");
    const outcomes = await runDueGroupings();
    expect(outcomes.find((outcome) => outcome.formId === formId)).toBeUndefined();
    const view = await loadGroupingView(formId, "nl");
    expect(view.ungrouped?.map((entry) => entry.name)).toEqual(["Te laat"]);
  });
});
