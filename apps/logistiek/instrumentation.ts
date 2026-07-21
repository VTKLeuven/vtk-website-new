/**
 * Next.js instrumentation-hook. Registreert de S3-configresolver zodat
 * @vtk/storage de objectopslag uit de live DB-config kan lezen (zelfde
 * `Setting`-rij als apps/web). Draait één keer bij het opstarten van de
 * server-runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getS3Config } = await import('./lib/runtime-config');
    const { setS3ConfigResolver } = await import('@vtk/storage');
    setS3ConfigResolver(getS3Config);
  }
}
