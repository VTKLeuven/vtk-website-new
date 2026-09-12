"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { logAudit } from "@/lib/audit";
import { readSlogansSetting } from "@/lib/slogans";

/**
 * De slogans van de homepage opslaan.
 *
 * Het formulier stuurt de hele lijst als JSON in één verborgen veld: de rijen
 * hebben een volgorde, twee talen en drie keuzes per stuk, en dat in genummerde
 * formuliervelden persen levert enkel een tweede, afwijkende lezing op. De
 * validatie is dan ook dezelfde functie als die de site gebruikt om de
 * instelling te lezen, zodat er maar één waarheid is over wat een geldige
 * slogan is.
 */
export async function saveSlogansAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("home.edit");

  const raw = formData.get("slogansData");
  if (typeof raw !== "string" || raw.trim() === "") return saveError("INVALID_INPUT");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return saveError("INVALID_INPUT");
  }

  // Een lege lijst is geen geldige toestand: de hero heeft een titel nodig, en
  // `readSlogansSetting` zou hier stilletjes de zaailijst uit de code voor in de
  // plaats zetten. Dat weigeren we hier, zodat de redacteur het hoort in plaats
  // van drie slogans terug te zien die hij net wiste.
  const items = Array.isArray((parsed as { items?: unknown })?.items)
    ? ((parsed as { items: unknown[] }).items)
    : [];
  if (items.length === 0) return saveError("NO_SLOGANS");

  const config = readSlogansSetting(parsed);
  if (config.items.length !== items.length) return saveError("EMPTY_SLOGAN");

  await prisma.setting.upsert({
    where: { key: "home.slogans" },
    update: { value: config },
    create: { key: "home.slogans", value: config },
  });

  const openers = config.items.filter((item) => item.opener).length;
  await logAudit({
    action: "update",
    entity: "home",
    target: "Slogans",
    summary: `${config.enabled !== false ? "Actief" : "Uitgeschakeld"}, ${config.items.length} slogan(s), waarvan ${openers} begroeting(en)`,
  });

  revalidatePath("/", "layout");
  revalidatePath("/admin/slogans");
  revalidatePath("/admin/home");
  revalidatePath("/admin/frontpage");

  return saveOk();
}
