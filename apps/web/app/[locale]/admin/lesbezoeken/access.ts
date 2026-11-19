import "server-only";
import { requireAnyPermission } from "@/lib/session";

/** Meekijken (`lesbezoeken.view`) of beheren (`lesbezoeken.manage`); zonder dat laatste geen knoppen. */
export async function lesbezoekAccess() {
  const session = await requireAnyPermission(["lesbezoeken.view", "lesbezoeken.manage"]);
  const canManage = session.user.isSuperAdmin || session.permissions.includes("lesbezoeken.manage");
  return { session, canManage };
}
