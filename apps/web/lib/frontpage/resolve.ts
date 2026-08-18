import "server-only";
import { prisma } from "@vtk/db";
import { readFieldValues, type FieldValues } from "./fields";
import {
  DEFAULT_FRONTPAGE_ID,
  getFrontpageModule,
  type FrontpageModule,
} from "./registry";

export type ResolvedFrontpage = {
  module: FrontpageModule;
  values: FieldValues;
};

export type FrontpageStatus = "live" | "scheduled" | "expired" | "off";

/**
 * Where a configured front page stands, purely derived from its own fields.
 * Whether it is actually on screen also depends on the others; see
 * `resolveFrontpage`.
 */
export function frontpageStatus(
  row: { active: boolean; startsAt: Date | null; endsAt: Date | null },
  now = new Date(),
): FrontpageStatus {
  if (!row.active) return "off";
  if (row.endsAt && row.endsAt < now) return "expired";
  if (row.startsAt && row.startsAt > now) return "scheduled";
  return "live";
}

/**
 * Which front page the homepage should render, and with which field values.
 *
 * An event front page takes over while it is active and inside its window. With
 * several eligible at once the one that started most recently wins; there is only
 * one front page, so "show both" does not exist. Outside every window the default
 * is used, which is why it can never be switched off.
 *
 * A row pointing at a layout that is no longer in the registry is ignored rather
 * than fatal: deleting a component should not take the homepage down with it.
 */
export async function resolveFrontpage(now = new Date()): Promise<ResolvedFrontpage> {
  const rows = await prisma.frontpage.findMany({
    orderBy: [{ startsAt: "desc" }, { updatedAt: "desc" }],
  });

  const takeover = rows.find((row) => {
    if (row.layout === DEFAULT_FRONTPAGE_ID) return false;
    if (!getFrontpageModule(row.layout)) return false;
    return frontpageStatus(row, now) === "live";
  });

  const chosen = takeover ?? rows.find((row) => row.layout === DEFAULT_FRONTPAGE_ID);
  const layoutModule =
    (chosen && getFrontpageModule(chosen.layout)) ?? getFrontpageModule(DEFAULT_FRONTPAGE_ID)!;

  return {
    module: layoutModule,
    values: chosen ? readFieldValues(chosen.values, layoutModule.fields) : {},
  };
}
