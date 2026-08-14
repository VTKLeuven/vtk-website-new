"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { linkPageConfigSchema, LINK_PAGE_SETTING_KEY } from "@/lib/link-page";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

export async function saveLinkPageAction(
  _previous: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("home.edit");

  const raw = formData.get("config");
  if (typeof raw !== "string" || raw.length > 100_000) return saveError("INVALID_CONFIG");

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return saveError("INVALID_CONFIG");
  }

  const parsed = linkPageConfigSchema.safeParse(input);
  if (!parsed.success) return saveError("INVALID_CONFIG");

  await prisma.setting.upsert({
    where: { key: LINK_PAGE_SETTING_KEY },
    update: { value: parsed.data },
    create: { key: LINK_PAGE_SETTING_KEY, value: parsed.data },
  });

  revalidatePath("/links");
  revalidatePath("/admin/linkpagina");
  revalidatePath("/en/admin/linkpagina");
  return saveOk();
}
