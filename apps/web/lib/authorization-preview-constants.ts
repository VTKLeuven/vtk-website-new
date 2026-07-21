export const AUTHORIZATION_PREVIEW_COOKIE = "vtk_authorization_preview";
export const AUTHORIZATION_PREVIEW_MAX_AGE = 2 * 60 * 60;
export const AUTHORIZATION_PREVIEW_STOP_PATH = "/api/admin/authorization-preview/stop";

export function blocksAuthorizationPreviewMutation(
  previewActive: boolean,
  method: string,
  pathname: string,
): boolean {
  if (!previewActive || pathname === AUTHORIZATION_PREVIEW_STOP_PATH) return false;
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}
