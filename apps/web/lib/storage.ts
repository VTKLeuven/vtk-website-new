export * from "@vtk/storage";

/**
 * URL waaronder een opgeslagen object in de browser te laden is. We serveren
 * alles via de eigen `/api/media`-route (zie die route) i.p.v. een directe
 * bucket-URL: `S3_PUBLIC_URL` wijst naar `http://localhost:9000/vtk`, wat in de
 * browser van een bezoeker naar diens eigen machine wijst en dus nooit laadt.
 * Same-origin gaan lost dat voor elke afbeelding tegelijk op.
 */
export function publicUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `/api/media/${path}`;
}
