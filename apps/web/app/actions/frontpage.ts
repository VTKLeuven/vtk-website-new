"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { deleteObject } from "@vtk/storage";
import { requirePermission } from "@/lib/session";
import { readImageField, resolveImageKey } from "@/lib/imageField";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { localDateTimeToUtc } from "@/lib/ticketing/time";
import { readFieldValues } from "@/lib/frontpage/fields";
import { DEFAULT_FRONTPAGE_ID, getFrontpageModule } from "@/lib/frontpage/registry";

/**
 * Field inputs arrive under `field.<name>`; see the note in FrontpageEditor. It
 * keeps a front page free to declare a field called `startsAt` or `active`
 * without colliding with this form's own controls.
 */
const FIELD_PREFIX = "field.";

/**
 * Saving one front page: its field values and, for anything but the default, its
 * window. Falls under `home.edit`, the same permission as the rest of the
 * homepage.
 *
 * The fields are not known here; they come from the layout's registry entry, and
 * this action only stores what that entry declares. A form posting an unknown
 * field is therefore ignored rather than trusted, which matters because the
 * whole point is that anyone can add fields without touching this file.
 */

function revalidate() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/frontpage");
}

/** "YYYY-MM-DDTHH:mm" from a datetime-local input; empty = no bound. */
function parseMoment(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    return localDateTimeToUtc(value);
  } catch {
    return null;
  }
}

export async function saveFrontpageAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("home.edit");

  const layout = formData.get("layout");
  if (typeof layout !== "string") return saveError("INVALID_INPUT");
  const layoutModule = getFrontpageModule(layout);
  if (!layoutModule) return saveError("UNKNOWN_LAYOUT");

  const existing = await prisma.frontpage.findUnique({ where: { layout } });
  const previous = readFieldValues(existing?.values, layoutModule.fields);

  const values: Record<string, string> = {};
  const staleImages: string[] = [];

  for (const [name, def] of Object.entries(layoutModule.fields)) {
    if (def.type === "image") {
      // The image field posts a key plus a "cleared" flag; an empty key on its
      // own means "upload not finished", not "delete the photo".
      const image = readImageField(formData, `${FIELD_PREFIX}${name}`);
      if (image.kind === "invalid") return saveError("INVALID_INPUT");
      const key = resolveImageKey(image, previous[name] ?? null);
      if (key) values[name] = key;
      if (previous[name] && previous[name] !== key) staleImages.push(previous[name]!);
      continue;
    }

    const raw = formData.get(`${FIELD_PREFIX}${name}`);
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed === "") continue;

    if (def.type === "url" && !/^(https?:\/\/|\/)/.test(trimmed)) {
      return saveError("LINK_INVALID");
    }
    if (def.type === "datetime") {
      const moment = parseMoment(trimmed);
      if (!moment) return saveError("INVALID_INPUT");
      values[name] = moment.toISOString();
      continue;
    }
    values[name] = trimmed;
  }

  // The default is the fallback; a window on it would leave the homepage with
  // nothing to show, so those fields are ignored and it is always active.
  const isDefault = layout === DEFAULT_FRONTPAGE_ID;
  const startsAt = isDefault ? null : parseMoment(formData.get("startsAt"));
  const endsAt = isDefault ? null : parseMoment(formData.get("endsAt"));
  if (startsAt && endsAt && endsAt <= startsAt) return saveError("WINDOW_INVALID");
  const active = isDefault ? true : formData.get("active") === "on";

  const data = { values, startsAt, endsAt, active, updatedById: session.user.id };
  await prisma.frontpage.upsert({
    where: { layout },
    update: data,
    create: { layout, ...data },
  });

  for (const key of staleImages) {
    try {
      await deleteObject(key);
    } catch {
      /* The database change stands even if storage cleanup fails for now. */
    }
  }

  revalidate();
  return saveOk();
}

/** Switch a front page on or off without opening its form. */
export async function setFrontpageActiveAction(formData: FormData): Promise<void> {
  const session = await requirePermission("home.edit");
  const layout = formData.get("layout");
  if (typeof layout !== "string" || layout === DEFAULT_FRONTPAGE_ID) return;
  if (!getFrontpageModule(layout)) return;
  const active = formData.get("active") === "1";
  // Attributed like a save. This button is the one that actually changes what
  // the site shows, so "who put the jobfair live, and when" has to be
  // answerable from this row alone.
  await prisma.frontpage.upsert({
    where: { layout },
    update: { active, updatedById: session.user.id },
    create: { layout, values: {}, active, updatedById: session.user.id },
  });
  revalidate();
}
