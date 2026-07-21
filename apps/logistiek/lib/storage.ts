export * from '@vtk/storage';

/**
 * URL waaronder een opgeslagen object in de browser te laden is. We serveren
 * alles via de eigen `/api/media`-route (same-origin), net als apps/web.
 */
export function publicUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const path = key.split('/').map(encodeURIComponent).join('/');
  return `/api/media/${path}`;
}
