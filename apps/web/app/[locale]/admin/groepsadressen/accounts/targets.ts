import "server-only";

import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import type { GoogleConfig } from "@/lib/google/config";
import { type PlanRow, planAccounts } from "@/lib/google/provision";

/**
 * Wie er in aanmerking komt voor een account, en welk adres ze zouden krijgen.
 *
 * Gedeeld door het scherm en de actie: de actie herberekent hiermee zelf in
 * plaats van de adressen uit het formulier over te nemen.
 */

export type ProvisionSource =
  | { kind: "group"; id: string }
  | { kind: "kiesploeg"; id: string };

export function parseSourceKey(raw: string): ProvisionSource | null {
  const [kind, id] = raw.split(":");
  if (!id) return null;
  if (kind === "group") return { kind: "group", id };
  if (kind === "kiesploeg") return { kind: "kiesploeg", id };
  return null;
}

export type TargetRow = PlanRow & {
  /** Enkel bij een kiesploeg: dit lid mag mailen vanaf zijn kiesploegadres. */
  sendFromAlias: boolean;
  forwardTo: string | null;
};

export type TargetPlan = {
  label: string;
  /** Ingevuld wanneer de bron een kiesploeg is; stuurt alias en OU. */
  kiesploeg: { id: string; code: string; workingYear: number } | null;
  rows: TargetRow[];
};

export async function collectTargets(
  cfg: GoogleConfig,
  source: ProvisionSource,
): Promise<TargetPlan> {
  if (source.kind === "group") {
    const group = await prisma.group.findUnique({
      where: { id: source.id },
      select: {
        nameNl: true,
        memberships: {
          where: { year: currentWorkingYear(), user: { active: true, deletedAt: null } },
          select: {
            user: {
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                googleEmail: true,
              },
            },
          },
          orderBy: { user: { name: "asc" } },
        },
      },
    });
    if (!group) throw new Error("onbekende post");

    const rows = await planAccounts(cfg, {
      targets: group.memberships.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        googleEmail: m.user.googleEmail,
      })),
    });

    return {
      label: group.nameNl,
      kiesploeg: null,
      rows: rows.map((row) => ({ ...row, sendFromAlias: false, forwardTo: null })),
    };
  }

  const kiesploeg = await prisma.kiesploeg.findUnique({
    where: { id: source.id },
    select: {
      id: true,
      code: true,
      workingYear: true,
      formalName: true,
      accountTemplate: true,
      aliasTemplate: true,
      members: {
        where: { user: { active: true, deletedAt: null } },
        select: {
          sendFromAlias: true,
          forwardTo: true,
          aliasEmail: true,
          user: {
            select: { id: true, name: true, firstName: true, lastName: true, googleEmail: true },
          },
        },
        orderBy: { user: { name: "asc" } },
      },
    },
  });
  if (!kiesploeg) throw new Error("onbekende kiesploeg");

  const rows = await planAccounts(cfg, {
    targets: kiesploeg.members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      googleEmail: m.user.googleEmail,
      aliasEmail: m.aliasEmail,
    })),
    kiesploeg: {
      code: kiesploeg.code,
      accountTemplate: kiesploeg.accountTemplate,
      aliasTemplate: kiesploeg.aliasTemplate,
    },
  });

  const byUser = new Map(kiesploeg.members.map((m) => [m.user.id, m]));
  return {
    label: kiesploeg.formalName,
    kiesploeg: { id: kiesploeg.id, code: kiesploeg.code, workingYear: kiesploeg.workingYear },
    rows: rows.map((row) => ({
      ...row,
      sendFromAlias: byUser.get(row.userId)?.sendFromAlias ?? false,
      forwardTo: byUser.get(row.userId)?.forwardTo ?? null,
    })),
  };
}
