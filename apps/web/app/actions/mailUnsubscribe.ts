"use server";

import { redirect } from "next/navigation";
import { saveError, type SaveState } from "@/lib/saveState";
import { unsubscribeFromCategory, verifyUnsubscribeToken } from "@/lib/mailUnsubscribe";

/**
 * De knop op /uitschrijven. Zonder login: de ondertekende link is het bewijs.
 *
 * Na het uitschrijven terug naar dezelfde link, die dan de bevestiging toont
 * ("Je bent uitgeschreven") in plaats van de vraag: de pagina verandert zelf,
 * dus dat is de feedback. Loopt via een throw, dus buiten elke try/catch.
 */
export async function unsubscribeMailCategoryAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const token = String(formData.get("t") ?? "");
  const locale = formData.get("locale") === "en" ? "en" : "nl";
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return saveError("INVALID_TOKEN");
  if (!(await unsubscribeFromCategory(parsed.userId, parsed.category))) return saveError("INVALID_TOKEN");
  redirect(`${locale === "en" ? "/en" : ""}/uitschrijven?t=${encodeURIComponent(token)}`);
}
