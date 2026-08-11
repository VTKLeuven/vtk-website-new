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
  | { status: "success"; nonce: number; message?: string }
  | { status: "error"; code: string; nonce: number; detail?: string };

/** Beginwaarde voor `useActionState`. */
export const SAVE_IDLE: SaveState = { status: "idle" };

/** Handtekening die `SaveForm` van een opslaan-actie verwacht. */
export type SaveAction = (prev: SaveState, formData: FormData) => Promise<SaveState>;

/**
 * `message` vervangt de vaste succesmelding van het formulier, voor het geval de
 * actie meer deed dan het formulier kon voorzien ("de exemplaren zijn weer één
 * rij"). Laat ze weg wanneer "Item opgeslagen." het hele verhaal is.
 */
export function saveOk(message?: string): SaveState {
  return { status: "success", nonce: Date.now(), message };
}

/**
 * `code` wordt clientside op een vertaalde melding gemapt; onbekende codes vallen
 * terug op de standaardmelding.
 *
 * `detail` is voor het geval de melding een gegeven bevat dat de client niet kan
 * kennen ("botst met de rit van Feest op za 12 sep 14:00-18:00"). Het vervangt de
 * standaardmelding, maar niet een vertaling die de client zelf voor die code
 * heeft: die blijft voorgaan. Schrijf hier dus een volledige, leesbare zin.
 */
export function saveError(code: string, detail?: string): SaveState {
  return { status: "error", code, nonce: Date.now(), detail };
}
