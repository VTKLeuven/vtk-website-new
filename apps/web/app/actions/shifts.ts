"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { parseShift, ShiftValidationError, type ShiftInput } from "@/lib/shift";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

/**
 * Bovengrens op één sjabloon-aanmaak. Een cantus zet er een tiental neer; wie
 * hier tegenaan loopt, heeft een fout in de offsets zitten en niet echt honderd
 * shiften nodig. Zo blijft één misklik ook geen half uur opkuiswerk.
 */
const MAX_SHIFTS_PER_BATCH = 100;

/**
 * Maakt in één keer alle shiften van een sjabloon aan.
 *
 * De client stuurt de (bijgewerkte) shiften als JSON in het veld `payload`, omdat
 * het formulier een variabel aantal rijen heeft die clientside samengesteld
 * worden uit sjabloon + globale velden. Elke rij gaat door dezelfde
 * {@link parseShift} als `POST /api/shift`, dus de tijden zijn Belgische
 * wandkloktijden en de validatieregels zijn identiek aan die van het losse
 * formulier.
 *
 * Aangemaakte shiften staan meteen op /shift: die pagina toont gewoon alle
 * toekomstige shiften, er is geen aparte publicatiestap.
 */
export async function createShiftsFromTemplateAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  await requirePermission("shift.edit");

  const raw = formData.get("payload");
  if (typeof raw !== "string" || raw.trim() === "") return saveError("badPayload");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return saveError("badPayload");
  }

  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { shifts?: unknown }).shifts)) {
    return saveError("badPayload");
  }

  const entries = (parsed as { shifts: unknown[] }).shifts;
  if (entries.length === 0) return saveError("empty");
  if (entries.length > MAX_SHIFTS_PER_BATCH) return saveError("tooMany");

  // Alle rijen eerst valideren: half aanmaken en dan afbreken laat de gebruiker
  // met een onduidelijke, gedeeltelijke reeks achter.
  const data: ShiftInput[] = [];
  const problems: string[] = [];
  entries.forEach((entry, index) => {
    try {
      data.push(parseShift(entry));
    } catch (err) {
      if (err instanceof ShiftValidationError) {
        problems.push(`Shift ${index + 1}: ${err.details.join(", ")}`);
        return;
      }
      throw err;
    }
  });

  if (problems.length > 0) {
    return saveError("invalid", problems.slice(0, 3).join(" · "));
  }

  await prisma.shift.createMany({ data });

  revalidatePath("/admin/shiften");
  revalidatePath("/en/admin/shiften");
  revalidatePath("/shift");
  revalidatePath("/en/shift");

  return saveOk();
}
