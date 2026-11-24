"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { type SaveState, saveError, saveOk } from "@/lib/saveState";
import { APP_LINKS_SETTING, cleanLink } from "@/lib/appLinks";

/**
 * Bewaart de links naar de app in de winkels (Admin › Website › App). Een leeg
 * veld wist de link; `vtk.be/app` toont dan enkel nog de andere winkel.
 */
export async function saveAppLinksAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("home.edit");

  const rawIos = String(formData.get("ios") ?? "").trim();
  const rawAndroid = String(formData.get("android") ?? "").trim();
  const ios = cleanLink(rawIos);
  const android = cleanLink(rawAndroid);
  // Iets ingevuld dat geen https-link is: niet stil weggooien maar melden.
  if ((rawIos && !ios) || (rawAndroid && !android)) return saveError("INVALID_LINK");

  await prisma.setting.upsert({
    where: { key: APP_LINKS_SETTING },
    create: { key: APP_LINKS_SETTING, value: { ios, android } },
    update: { value: { ios, android } },
  });
  await logAudit({
    action: "update",
    entity: "appLinks",
    target: "Links naar de app",
    summary: [ios ? "App Store" : null, android ? "Google Play" : null].filter(Boolean).join(" en ") || "gewist",
  });

  revalidatePath("/[locale]/admin/app", "page");
  revalidatePath("/[locale]/app", "page");
  return saveOk();
}
