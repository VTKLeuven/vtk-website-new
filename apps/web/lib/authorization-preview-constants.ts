export const AUTHORIZATION_PREVIEW_COOKIE = "vtk_authorization_preview";
export const AUTHORIZATION_PREVIEW_MAX_AGE = 2 * 60 * 60;
export const AUTHORIZATION_PREVIEW_STOP_PATH = "/api/admin/authorization-preview/stop";
/**
 * Wat de proxy antwoordt op een schrijfactie tijdens een voorvertoning. Bij een
 * server action is dat de platte tekst van het antwoord, en die wordt in de
 * browser de `message` van de fout die Next gooit; `lib/unsentSave.ts` herkent
 * ze daaraan.
 */
export const AUTHORIZATION_PREVIEW_READ_ONLY = "AUTHORIZATION_PREVIEW_READ_ONLY";

export function blocksAuthorizationPreviewMutation(
  previewActive: boolean,
  method: string,
  pathname: string,
): boolean {
  if (!previewActive || pathname === AUTHORIZATION_PREVIEW_STOP_PATH) return false;
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}
