import { notFound } from 'next/navigation';
import {
  Archive,
  Box,
  Database,
  HardDrive,
  Image as ImageIcon,
  RefreshCw,
  Server,
} from 'lucide-react';
import type { ImmichAlbumKind, ImmichSourceFailure } from '@vtk/gallery';
import type { ReactNode } from 'react';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { getStorageInsights, type LocalStorageSource } from '@/lib/storage-insights';

const NUMBER = new Intl.NumberFormat('en-BE');
const DATE_TIME = new Intl.DateTimeFormat('en-BE', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'Europe/Brussels',
});

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return 'Unavailable';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${new Intl.NumberFormat('en-BE', {
    maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2,
  }).format(value)} ${units[index]}`;
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (part / total) * 100));
}

function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return `${new Intl.NumberFormat('en-BE', { maximumFractionDigits: 1 }).format(value)}%`;
}

function safeEndpoint(endpoint: string | null): string | null {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function ProgressBar({ value, tone = 'navy' }: { value: number; tone?: 'navy' | 'yellow' | 'green' }) {
  const color = tone === 'yellow' ? 'bg-vtk-yellow' : tone === 'green' ? 'bg-emerald-500' : 'bg-vtk-ink';
  return (
    <div className="h-2 overflow-hidden rounded-full bg-zinc-100" aria-hidden="true">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${value <= 0 ? 0 : Math.max(0.5, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-vtk-blue/15 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-vtk-ink">{value}</p>
        </div>
        <span className="rounded-xl bg-vtk-blue/10 p-2.5 text-vtk-ink">{icon}</span>
      </div>
      <p className="mt-3 text-sm text-zinc-500">{detail}</p>
    </article>
  );
}

function SectionHeading({
  icon,
  title,
  description,
  badge,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-xl bg-vtk-blue/10 p-2 text-vtk-ink">{icon}</span>
        <div>
          <h2 className="text-xl font-semibold text-vtk-ink">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">{description}</p>
        </div>
      </div>
      {badge ? (
        <span className="rounded-full border border-vtk-blue/15 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function Unavailable({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-amber-900/80">{detail}</p>
    </div>
  );
}

function storageFailureText(reason: 'not-configured' | 'unavailable') {
  return reason === 'not-configured'
    ? 'Object storage is not configured. Save a complete S3 configuration under Admin → IT → Configuration.'
    : 'The bucket could not be listed. Check connectivity and grant the configured S3 key ListBucket access.';
}

function immichFailureText(reason: ImmichSourceFailure, permission: string): string {
  if (reason === 'not-configured') return 'The Immich API key is not configured.';
  if (reason === 'forbidden') return `The Immich API key does not have the ${permission} permission.`;
  return 'Immich is not reachable or returned an invalid response.';
}

const ALBUM_KIND: Record<ImmichAlbumKind, { label: string; className: string }> = {
  main: { label: 'vtk.be /media', className: 'bg-blue-50 text-blue-800' },
  fakbar: { label: "'t ElixIr", className: 'bg-violet-50 text-violet-800' },
  private: { label: 'Other / private', className: 'bg-zinc-100 text-zinc-700' },
  ambiguous: { label: 'Ambiguous', className: 'bg-amber-100 text-amber-900' },
};

const LOCAL_KIND: Record<LocalStorageSource['kind'], string> = {
  database: 'Database',
  runtime: 'App runtime',
  backup: 'Backup',
  cache: 'Cache',
};

export default async function StoragePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();

  const session = await requireSession();
  if (!session.user.isSuperAdmin) notFound();

  const report = await getStorageInsights();
  const s3Data = report.s3.available ? report.s3.data : null;
  const s3Failure = report.s3.available ? null : report.s3.reason;
  const immichDisk = report.immich.disk.available ? report.immich.disk.data : null;
  const immichDiskFailure = report.immich.disk.available ? null : report.immich.disk.reason;
  const immichLibrary = report.immich.library.available ? report.immich.library.data : null;
  const immichLibraryFailure = report.immich.library.available ? null : report.immich.library.reason;
  const immichAlbums = report.immich.albums.available ? report.immich.albums.data : null;
  const immichAlbumsFailure = report.immich.albums.available ? null : report.immich.albums.reason;
  const mainGallery = immichAlbums?.totals.main ?? null;
  const endpoint = safeEndpoint(report.s3Status.endpoint);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Storage</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-500">
            Aggregate storage use across object storage, Immich and the local application server. No individual
            files or object keys are shown.
          </p>
          <p className="mt-1 text-xs text-zinc-400">Measured {DATE_TIME.format(new Date(report.measuredAt))}</p>
        </div>
        <a
          href=""
          className="inline-flex items-center gap-2 rounded-full border border-vtk-blue/20 bg-white px-4 py-2 text-sm font-medium text-vtk-ink no-underline shadow-sm hover:bg-vtk-blue/5"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Measure again
        </a>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Storage overview">
        <MetricCard
          icon={<Archive className="h-5 w-5" aria-hidden="true" />}
          label="S3 object storage"
          value={s3Data ? formatBytes(s3Data.totalBytes) : 'Unavailable'}
          detail={s3Data ? `${NUMBER.format(s3Data.objectCount)} objects in the bucket` : 'Bucket inventory could not be read'}
        />
        <MetricCard
          icon={<ImageIcon className="h-5 w-5" aria-hidden="true" />}
          label="vtk.be /media"
          value={mainGallery ? formatBytes(mainGallery.originalBytes) : 'Unavailable'}
          detail={mainGallery ? `${NUMBER.format(mainGallery.uniqueAssetCount)} unique assets in ${NUMBER.format(mainGallery.albumCount)} albums` : 'Album inventory could not be read'}
        />
        <MetricCard
          icon={<HardDrive className="h-5 w-5" aria-hidden="true" />}
          label="Immich available"
          value={immichDisk ? formatBytes(immichDisk.availableBytes) : 'Unavailable'}
          detail={immichDisk ? `${formatPercentage(immichDisk.usagePercentage)} of its storage medium is used` : 'Disk capacity could not be read'}
        />
        <MetricCard
          icon={<Server className="h-5 w-5" aria-hidden="true" />}
          label="Local disk available"
          value={report.local.filesystem.available ? formatBytes(report.local.filesystem.data.availableBytes) : 'Unavailable'}
          detail={report.local.filesystem.available ? `${formatBytes(report.local.filesystem.data.usedBytes)} used on the filesystem` : 'Server filesystem statistics unavailable'}
        />
      </section>

      <section className="space-y-5 rounded-2xl border border-vtk-blue/15 bg-white p-5 shadow-sm sm:p-6">
        <SectionHeading
          icon={<Archive className="h-5 w-5" aria-hidden="true" />}
          title="Object storage (S3)"
          description="A complete bucket listing grouped by feature-owned prefixes and, for the shared images prefix, current database references. The size is the actual stored object size, including unreferenced objects."
          badge={report.s3Status.source === 'database' ? 'Database configuration' : 'Environment configuration'}
        />

        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl bg-zinc-50 px-4 py-3 text-sm">
          <span><span className="text-zinc-500">Bucket</span> <strong className="ml-1 font-medium text-vtk-ink">{report.s3Status.bucket || 'Not configured'}</strong></span>
          <span><span className="text-zinc-500">Endpoint</span> <strong className="ml-1 font-medium text-vtk-ink">{endpoint || 'Not configured'}</strong></span>
          <span><span className="text-zinc-500">Region</span> <strong className="ml-1 font-medium text-vtk-ink">{report.s3Status.region || 'Default'}</strong></span>
        </div>

        {s3Data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-vtk-blue/5 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Stored</p>
                <p className="mt-1 text-xl font-semibold text-vtk-ink">{formatBytes(s3Data.totalBytes)}</p>
              </div>
              <div className="rounded-xl bg-vtk-blue/5 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Objects</p>
                <p className="mt-1 text-xl font-semibold text-vtk-ink">{NUMBER.format(s3Data.objectCount)}</p>
              </div>
              <div className="rounded-xl bg-vtk-blue/5 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Largest object</p>
                <p className="mt-1 text-xl font-semibold text-vtk-ink">{formatBytes(s3Data.largestObjectBytes)}</p>
              </div>
            </div>

            <div className="space-y-4">
              {s3Data.features.map((feature) => {
                const share = percentage(feature.bytes, s3Data.totalBytes);
                return (
                  <article key={feature.id} className="grid gap-2 sm:grid-cols-[minmax(180px,0.8fr)_minmax(240px,1.5fr)_auto] sm:items-center sm:gap-5">
                    <div>
                      <p className="font-medium text-vtk-ink">{feature.label}</p>
                      <p className="text-xs text-zinc-500">{NUMBER.format(feature.objectCount)} objects</p>
                    </div>
                    <div>
                      <ProgressBar value={share} tone={feature.id === 'other' ? 'yellow' : 'navy'} />
                      <p className="mt-1 text-xs text-zinc-500">{feature.description}</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="font-semibold tabular-nums text-vtk-ink">{formatBytes(feature.bytes)}</p>
                      <p className="text-xs tabular-nums text-zinc-500">{formatPercentage(share)}</p>
                    </div>
                  </article>
                );
              })}
            </div>

            <p className="rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
              Standard S3 does not expose the provider plan quota, so remaining S3 capacity cannot be calculated from the bucket API.
            </p>
          </>
        ) : (
          <Unavailable title="S3 inventory unavailable" detail={storageFailureText(s3Failure!)} />
        )}
      </section>

      <section className="space-y-6 rounded-2xl border border-vtk-blue/15 bg-white p-5 shadow-sm sm:p-6">
        <SectionHeading
          icon={<ImageIcon className="h-5 w-5" aria-hidden="true" />}
          title="Immich gallery"
          description="Immich reports the capacity of its media filesystem. Album sizes below are the original files; generated thumbnails, previews, encoded video and the Immich database are tracked separately."
          badge={report.immich.configured ? 'API configured' : 'Not configured'}
        />

        {immichDisk ? (
          <div className="rounded-xl bg-zinc-50 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-vtk-ink">Immich storage medium</p>
                <p className="text-xs text-zinc-500">
                  {formatBytes(immichDisk.usedBytes)} used of {formatBytes(immichDisk.totalBytes)}
                </p>
              </div>
              <p className="text-sm font-semibold text-vtk-ink">{formatBytes(immichDisk.availableBytes)} available</p>
            </div>
            <ProgressBar value={immichDisk.usagePercentage} tone={immichDisk.usagePercentage >= 85 ? 'yellow' : 'green'} />
          </div>
        ) : (
          <Unavailable
            title="Immich disk capacity unavailable"
            detail={immichFailureText(immichDiskFailure!, 'server.storage')}
          />
        )}

        {immichLibrary ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Original media</p>
              <p className="mt-1 text-xl font-semibold text-vtk-ink">{formatBytes(immichLibrary.originalBytes)}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Photos</p>
              <p className="mt-1 text-xl font-semibold text-vtk-ink">{NUMBER.format(immichLibrary.photos)}</p>
              <p className="text-xs text-zinc-500">{formatBytes(immichLibrary.photoBytes)}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Videos</p>
              <p className="mt-1 text-xl font-semibold text-vtk-ink">{NUMBER.format(immichLibrary.videos)}</p>
              <p className="text-xs text-zinc-500">{formatBytes(immichLibrary.videoBytes)}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Derived / other</p>
              <p className="mt-1 text-xl font-semibold text-vtk-ink">
                {immichDisk
                  ? formatBytes(Math.max(0, immichDisk.usedBytes - immichLibrary.originalBytes))
                  : 'Unavailable'}
              </p>
              <p className="text-xs text-zinc-500">Upper bound on the medium, not solely Immich overhead</p>
            </div>
          </div>
        ) : (
          <Unavailable
            title="Immich library statistics unavailable"
            detail={immichFailureText(immichLibraryFailure!, 'server.statistics')}
          />
        )}

        {immichAlbums ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(Object.keys(ALBUM_KIND) as ImmichAlbumKind[]).map((kind) => {
                const item = immichAlbums.totals[kind];
                return (
                  <div key={kind} className="rounded-xl border border-zinc-200 p-4">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ALBUM_KIND[kind].className}`}>
                      {ALBUM_KIND[kind].label}
                    </span>
                    <p className="mt-3 text-xl font-semibold text-vtk-ink">{formatBytes(item.originalBytes)}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {NUMBER.format(item.uniqueAssetCount)} unique assets · {NUMBER.format(item.albumCount)} albums
                    </p>
                  </div>
                );
              })}
            </div>

            {immichAlbums.failedAlbumCount > 0 ? (
              <Unavailable
                title={`${NUMBER.format(immichAlbums.failedAlbumCount)} album measurements failed`}
                detail="Those albums remain in the table as unavailable; the successful album totals are still shown."
              />
            ) : null}

            <div className="overflow-x-auto rounded-xl border border-zinc-200">
              <table>
                <thead>
                  <tr>
                    <th>Album</th>
                    <th>Gallery</th>
                    <th className="text-right">Assets</th>
                    <th className="min-w-44">Original size</th>
                  </tr>
                </thead>
                <tbody>
                  {immichAlbums.items.length === 0 ? (
                    <tr><td colSpan={4} className="text-zinc-500">No albums found.</td></tr>
                  ) : immichAlbums.items.map((album, index) => {
                    const maxBytes = immichAlbums.items[0]?.originalBytes ?? 0;
                    return (
                      <tr key={`${album.kind}-${album.title}-${index}`}>
                        <td>
                          <p className="font-medium text-vtk-ink">{album.title}</p>
                          {album.unknownSizeCount > 0 ? (
                            <p className="text-xs text-amber-700">{NUMBER.format(album.unknownSizeCount)} assets have no size metadata</p>
                          ) : null}
                        </td>
                        <td>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ALBUM_KIND[album.kind].className}`}>
                            {ALBUM_KIND[album.kind].label}
                          </span>
                        </td>
                        <td className="text-right tabular-nums text-zinc-600">{NUMBER.format(album.assetCount)}</td>
                        <td>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-20 flex-1">
                              {album.originalBytes === null ? null : <ProgressBar value={percentage(album.originalBytes, maxBytes)} />}
                            </div>
                            <span className="min-w-20 text-right font-medium tabular-nums text-vtk-ink">
                              {album.originalBytes === null ? 'Unavailable' : `${album.unknownSizeCount ? '≥ ' : ''}${formatBytes(album.originalBytes)}`}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
              Album totals are deduplicated within each gallery. The same asset may belong to multiple albums, so adding the rows can overstate physical use. “vtk.be /media” means the album carries the configured [gallery] marker.
            </p>
          </>
        ) : (
          <Unavailable
            title="Immich album inventory unavailable"
            detail={immichFailureText(immichAlbumsFailure!, 'album.read and asset.read')}
          />
        )}
      </section>

      <section className="space-y-5 rounded-2xl border border-vtk-blue/15 bg-white p-5 shadow-sm sm:p-6">
        <SectionHeading
          icon={<HardDrive className="h-5 w-5" aria-hidden="true" />}
          title="Local server storage"
          description="Disk capacity seen by the web process plus the application sources it can safely measure. Database sizes are logical PostgreSQL sizes and include their indexes."
          badge="Server-side measurement"
        />

        {report.local.filesystem.available ? (
          <div className="rounded-xl bg-zinc-50 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-vtk-ink">Filesystem visible to the web container</p>
                <p className="text-xs text-zinc-500">
                  {formatBytes(report.local.filesystem.data.usedBytes)} used of {formatBytes(report.local.filesystem.data.totalBytes)}
                </p>
              </div>
              <p className="text-sm font-semibold text-vtk-ink">{formatBytes(report.local.filesystem.data.availableBytes)} available</p>
            </div>
            <ProgressBar value={percentage(report.local.filesystem.data.usedBytes, report.local.filesystem.data.totalBytes)} />
          </div>
        ) : (
          <Unavailable title="Local filesystem unavailable" detail="The operating system did not return filesystem capacity statistics." />
        )}

        <div className="overflow-x-auto rounded-xl border border-zinc-200">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th className="text-right">Measured size</th>
              </tr>
            </thead>
            <tbody>
              {report.local.sources.map((source) => (
                <tr key={source.id}>
                  <td>
                    <p className="font-medium text-vtk-ink">{source.label}</p>
                    <p className="text-xs text-zinc-500">{source.description}</p>
                  </td>
                  <td>
                    <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                      {LOCAL_KIND[source.kind]}
                    </span>
                  </td>
                  <td className="text-right font-semibold tabular-nums text-vtk-ink">{formatBytes(source.bytes)}</td>
                </tr>
              ))}
              {report.local.sources.length === 0 ? (
                <tr><td colSpan={3} className="text-zinc-500">No local sources could be measured.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-vtk-ink">
            <Box className="h-4 w-4" aria-hidden="true" />
            Measurement coverage
          </div>
          <ul className="mt-2 space-y-1 text-xs text-zinc-500">
            {report.local.notes.map((note) => <li key={note}>• {note}</li>)}
          </ul>
        </div>
      </section>

      <aside className="flex gap-3 rounded-2xl border border-vtk-blue/15 bg-vtk-blue/5 p-5 text-sm text-zinc-600">
        <Database className="mt-0.5 h-5 w-5 shrink-0 text-vtk-ink" aria-hidden="true" />
        <p>
          These numbers are a live snapshot, not billing data. S3 object totals are exact at listing time; Immich and local files can change while a scan is running. Reload this tab to measure again.
        </p>
      </aside>
    </div>
  );
}
