import { prisma } from "@vtk/db";
import { publicUrl } from "@/lib/storage";

/**
 * De standaardfoto voor evenementen zonder eigen cover.
 *
 * Beheerders kunnen die vervangen via /admin/home; zolang er niets geüpload is,
 * geldt het bestand in `public/`. Zo hoeft een nieuwe standaardfoto geen deploy.
 */
export const DEFAULT_EVENT_IMAGE_SETTING = "home.defaultEventImage";

/** De meegeleverde foto, ook de preview-fallback in admin-formulieren. */
export const BUILTIN_DEFAULT_EVENT_IMAGE = "/default-event.jpg";

export async function getDefaultEventImage(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: DEFAULT_EVENT_IMAGE_SETTING } });
  const value = row?.value as { imageKey?: string | null } | undefined;
  return publicUrl(value?.imageKey ?? undefined) ?? BUILTIN_DEFAULT_EVENT_IMAGE;
}
