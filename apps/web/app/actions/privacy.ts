"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@vtk/auth/server";
import { eraseUserData } from "@/lib/privacy/account";
import { requireSession } from "@/lib/session";

export async function deleteMyAccountAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (String(formData.get("confirmation") ?? "") !== "DELETE") {
    throw new Error("CONFIRMATION_REQUIRED");
  }

  await signOut(await headers());
  await eraseUserData(session.user.id);
  redirect("/");
}
