/**
 * Een opslag die de server nooit verwerkte, en waarom. Staat sinds november
 * 2026 in `@vtk/ui/unsent-save`, gedeeld met de uitleendienst; zie daar voor
 * het waarom. De voorvertoning als iemand anders is enkel van vtk.be:
 * test/unsentSave.test.ts houdt de tekst daar gelijk met
 * `AUTHORIZATION_PREVIEW_READ_ONLY`.
 */
export {
  UNSENT_SAVE_CODES,
  unsentSaveMessage,
  unsentSaveReason,
  type UnsentReason,
} from "@vtk/ui/unsent-save";
