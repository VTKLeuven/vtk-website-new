import { Buffer } from "node:buffer";
import type { AuthGroupRole } from "@vtk/auth";

const MAX_SELECTIONS = 50;

export type AuthorizationPreviewSelection = {
  actorId: string;
  roleIds: string[];
  groups: Array<{ id: string; role: AuthGroupRole }>;
};

export function encodeAuthorizationPreview(selection: AuthorizationPreviewSelection): string {
  return Buffer.from(JSON.stringify(selection), "utf8").toString("base64url");
}

export function decodeAuthorizationPreview(value: string | undefined): AuthorizationPreviewSelection | null {
  if (!value || value.length > 8_000) return null;

  try {
    const candidate = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!candidate || typeof candidate !== "object") return null;

    const raw = candidate as Record<string, unknown>;
    if (typeof raw.actorId !== "string" || raw.actorId.length === 0) return null;
    if (!Array.isArray(raw.roleIds) || !Array.isArray(raw.groups)) return null;
    if (raw.roleIds.length > MAX_SELECTIONS || raw.groups.length > MAX_SELECTIONS) return null;
    if (!raw.roleIds.every((id) => typeof id === "string" && id.length > 0)) return null;

    const groups: AuthorizationPreviewSelection["groups"] = [];
    for (const entry of raw.groups) {
      if (!entry || typeof entry !== "object") return null;
      const group = entry as Record<string, unknown>;
      if (
        typeof group.id !== "string" ||
        group.id.length === 0 ||
        (group.role !== "MEMBER" && group.role !== "LEAD")
      ) {
        return null;
      }
      groups.push({ id: group.id, role: group.role });
    }

    return {
      actorId: raw.actorId,
      roleIds: [...new Set(raw.roleIds as string[])],
      groups: [...new Map(groups.map((group) => [group.id, group])).values()],
    };
  } catch {
    return null;
  }
}
