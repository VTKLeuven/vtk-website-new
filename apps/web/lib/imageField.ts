/**
 * Leest de waarde van een `StorageImageField` uit een `FormData`.
 *
 * Een leeg key-veld is bewust géén "verwijder de foto": het is ook wat je krijgt
 * wanneer een upload nog niet klaar is of gefaald heeft. Dat verschil stilzwijgend
 * negeren wiste de bestaande foto en verwijderde het object uit storage; de
 * gebruiker zag enkel een groene "Opgeslagen"-toast. Daarom stuurt het veld een
 * expliciete `<name>__cleared`-vlag mee wanneer iemand op de prullenbak klikt, en
 * betekent "leeg zonder die vlag" hier: laat staan wat er stond.
 */

export type ImageFieldValue =
  | { kind: "keep" }
  | { kind: "set"; key: string }
  | { kind: "clear" }
  | { kind: "invalid" };

export function readImageField(formData: FormData, name = "imageKey"): ImageFieldValue {
  const raw = formData.get(name);
  const cleared = formData.get(`${name}__cleared`) === "1";

  if (typeof raw === "string" && raw) {
    // De upload-route legt afbeeldingen altijd onder `images/`; een key van
    // elders is geknoei met het verborgen veld.
    if (!raw.startsWith("images/")) return { kind: "invalid" };
    return { kind: "set", key: raw };
  }

  return cleared ? { kind: "clear" } : { kind: "keep" };
}

/** De nieuwe key, gegeven wat er nu opgeslagen staat. */
export function resolveImageKey(
  value: Exclude<ImageFieldValue, { kind: "invalid" }>,
  existing: string | null,
): string | null {
  if (value.kind === "set") return value.key;
  if (value.kind === "clear") return null;
  return existing;
}
