"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import { getActualSession } from "@/lib/session";
import {
  AUTHORIZATION_PREVIEW_COOKIE,
  AUTHORIZATION_PREVIEW_MAX_AGE,
  encodeAuthorizationPreview,
  type AuthorizationPreviewSelection,
} from "@/lib/authorization-preview";

export async function startAuthorizationPreview(formData: FormData): Promise<void> {
  const session = await getActualSession();
  if (!session?.user.isSuperAdmin) throw new Error("FORBIDDEN");

  const locale = formData.get("locale") === "en" ? "en" : "nl";
  const roleIds = [...new Set(formData.getAll("roleId").filter((id): id is string => typeof id === "string"))];
  const groupIds = [...new Set(formData.getAll("groupId").filter((id): id is string => typeof id === "string"))];
  if (roleIds.length > 50 || groupIds.length > 50) throw new Error("INVALID_INPUT");

  const groups: AuthorizationPreviewSelection["groups"] = groupIds.map((id) => ({
    id,
    role: formData.get(`groupRole:${id}`) === "LEAD" ? "LEAD" : "MEMBER",
  }));

  const [roleCount, groupCount] = await Promise.all([
    prisma.role.count({ where: { id: { in: roleIds } } }),
    prisma.group.count({ where: { id: { in: groupIds }, active: true } }),
  ]);
  if (roleCount !== roleIds.length || groupCount !== groupIds.length) throw new Error("INVALID_INPUT");

  const value = encodeAuthorizationPreview({
    actorId: session.user.id,
    roleIds,
    groups,
  });
  // Browsers generally cap one cookie at 4096 bytes. Leave room for the name
  // and attributes instead of silently starting a preview that cannot persist.
  if (value.length > 3_800) throw new Error("INVALID_INPUT");
  (await cookies()).set(AUTHORIZATION_PREVIEW_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AUTHORIZATION_PREVIEW_MAX_AGE,
  });

  redirect(`${locale === "en" ? "/en" : ""}/admin`);
}
