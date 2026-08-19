import type { SessionPayload } from "@vtk/auth";
import { hasPermission } from "@vtk/auth";

type SharedTileTarget = {
  scope: string;
  groupId: string | null;
};

/**
 * Globale tegels en posttegels hebben bewust aparte rechten. Het bestaande
 * `dashboard.manage` wordt het globale recht, zodat bestaande roltoewijzingen
 * hun toegang tot de tegels voor iedereen behouden.
 */
export function canManageSharedDashboardTile(
  session: SessionPayload,
  target: SharedTileTarget
): boolean {
  if (target.scope === "GLOBAL") {
    return hasPermission(session, "dashboard.manage");
  }
  if (target.scope === "GROUP" && target.groupId) {
    return hasPermission(session, "dashboard.manageOwn", { groupId: target.groupId });
  }
  return false;
}

export function canManageAnySharedDashboardTile(session: SessionPayload): boolean {
  return (
    hasPermission(session, "dashboard.manage") ||
    (hasPermission(session, "dashboard.manageOwn") && session.groups.length > 0)
  );
}
