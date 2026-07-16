/**
 * Gedeelde uitkomst van een opslaan-actie, gebruikt door `SaveForm`.
 *
 * Server actions die iets opslaan geven dit terug in plaats van `void`, zodat het
 * formulier kan tonen of het gelukt is. Verwachte invoerfouten (een dubbel
 * r-nummer, een te grote foto) horen hier als `status: "error"` terug te komen;
 * onverwachte serverfouten mogen gewoon gooien en horen in de error boundary.
 *
 * `nonce` onderscheidt twee opeenvolgende, verder identieke resultaten van
 * elkaar, zodat de client per submit exact één toast toont.
 */
export type SaveState =
  | { status: "idle" }
  | { status: "success"; nonce: number }
  | { status: "error"; code: string; nonce: number };

/** Beginwaarde voor `useActionState`. */
export const SAVE_IDLE: SaveState = { status: "idle" };

/** Handtekening die `SaveForm` van een opslaan-actie verwacht. */
export type SaveAction = (prev: SaveState, formData: FormData) => Promise<SaveState>;

export function saveOk(): SaveState {
  return { status: "success", nonce: Date.now() };
}

/** `code` wordt clientside op een vertaalde melding gemapt; onbekende codes vallen terug. */
export function saveError(code: string): SaveState {
  return { status: "error", code, nonce: Date.now() };
}
