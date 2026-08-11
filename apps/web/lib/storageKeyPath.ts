/**
 * Encodeert elk segment van een storage-key zonder de map-schuine strepen te
 * verliezen. De media-route verwacht die segmenten apart in de URL.
 */
export function storageKeyPath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}
