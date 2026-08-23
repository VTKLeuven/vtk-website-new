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
  /** Enkel bij een kiesploeg: dit lid mag nu al mailen. */
  mailboxActive: boolean;
  forwardTo: string | null;
};

export type TargetPlan = {
  label: string;
  /** Ingevuld wanneer de bron een kiesploeg is; stuurt alias en OU. */
  kiesploeg: { code: string } | null;
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
      rows: rows.map((row) => ({ ...row, mailboxActive: true, forwardTo: null })),
    };
  }

  const kiesploeg = await prisma.kiesploeg.findUnique({
    where: { id: source.id },
    select: {
      code: true,
      formalName: true,
      accountTemplate: true,
      aliasTemplate: true,
      members: {
        where: { user: { active: true, deletedAt: null } },
        select: {
          mailboxActive: true,
          forwardTo: true,
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
    kiesploeg: { code: kiesploeg.code },
    rows: rows.map((row) => ({
      ...row,
      mailboxActive: byUser.get(row.userId)?.mailboxActive ?? false,
      forwardTo: byUser.get(row.userId)?.forwardTo ?? null,
    })),
  };
}
