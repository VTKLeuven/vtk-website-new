/**
 * Het vangnet voor een server action die de server nooit bereikte. Staat sinds
 * november 2026 in `@vtk/ui/unsent-guard`, gedeeld met de uitleendienst; zie
 * daar voor het gebruik (`unsentGuard.form`, `.state`, `.run`, `ActionForm`).
 */
export {
  ActionForm,
  UNSENT,
  UNSENT_TOAST_EVENT,
  unsentGuard,
  useUnsentGuard,
  type UnsentGuard,
} from "@vtk/ui/unsent-guard";
