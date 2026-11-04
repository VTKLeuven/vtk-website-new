import Image from 'next/image';
import { notFound } from 'next/navigation';
import Link from '@/components/ui/Link';
import { InfoTip } from '@/components/ui/InfoTip';
import { SaveForm } from '@/components/ui/SaveForm';
import { scanStorageNowAction, setStorageCleanupDeletionAction } from '@/app/actions/storage-cleanup';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { publicUrl } from '@/lib/storage';
import { storageFeatureForKey } from '@/lib/storage-categories';
import { getCleanupReport, type CleanupRunSummary } from '@/lib/storage-cleanup';
import {
  CLEANUP_PREFIXES,
  GRACE_DAYS,
  MAX_DELETES_PER_RUN,
  MIN_OBJECT_AGE_DAYS,
  deletionDate,
} from '@/lib/storage-cleanup-plan';

// Superadmin-only tooling: copy stays in English (technical terms), like the
// storage page this belongs to.

/** Zoveel wezen toont de tabel; de rest staat in de telling erboven. */
const ROW_LIMIT = 300;

const NUMBER = new Intl.NumberFormat('en-BE');
const DATE = new Intl.DateTimeFormat('en-BE', { dateStyle: 'medium', timeZone: 'Europe/Brussels' });
const DATE_TIME = new Intl.DateTimeFormat('en-BE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Brussels',
});

const IMAGE_PREFIXES = ['images/', 'logos/', 'tiles/', 'badges/'];

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  // Dezelfde afronding als de storage-pagina, zodat beide hetzelfde getal tonen.
  return `${new Intl.NumberFormat('en-BE', { maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2 }).format(value)} ${units[index]}`;
}

function plural(count: number, one: string, many: string): string {
  return `${NUMBER.format(count)} ${count === 1 ? one : many}`;
}

function runLine(run: CleanupRunSummary): string {
  const when = DATE_TIME.format(new Date(run.finishedAt));
  const kind = run.trigger === 'nightly' ? 'nightly run' : 'manual scan';
  if (run.status === 'ok') return `${when}, ${kind}, ${NUMBER.format(Math.round(run.durationMs / 100) / 10)} s`;
  return `${when}, ${kind}`;
}

const errorMessages: Record<string, string> = {
  S3_NOT_CONFIGURED: 'Scan skipped: object storage is not configured. Save an S3 configuration under IT first.',
  SCAN_FAILED: 'Scan failed, nothing was marked. The error is shown on this page.',
};

export default async function StorageCleanupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();

  const session = await requireSession();
  if (!session.user.isSuperAdmin) notFound();

  const now = new Date();
  const report = await getCleanupReport({ limit: ROW_LIMIT, now });
  const { settings, lastRun } = report;
  const ok = report.lastOk;

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/${locale}/admin/it/storage`} className="text-sm font-medium text-[#5c667f] hover:text-vtk-ink">
          &larr; Storage
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">File cleanup</h1>
        <div className="mt-2 flex max-w-3xl items-start gap-2">
          <p className="text-sm text-zinc-500">
            Files from the general uploader that no row in the database mentions any more. Each night the whole
            database is searched for their key; a file that stays unreferenced for {GRACE_DAYS} days in a row is
            deleted from the bucket.
          </p>
          <InfoTip label="What the cleanup looks at">
            <p>
              Only these folders: {CLEANUP_PREFIXES.map((prefix) => `${prefix}/`).join(', ')}. Receipts, form
              uploads, profile photos, magazines, logistics files and ticket artwork have their own owner row and
              are never touched.
            </p>
            <p>
              A file counts as referenced when its key appears anywhere: in an image field, in Markdown, in a
              setting, in a sent mail in the email log. Every text and JSON column of every table is searched, so
              a new feature is covered without a change here.
            </p>
            <p>
              Files younger than {MIN_OBJECT_AGE_DAYS} days are skipped, because the editor uploads before the
              page is saved. At most {NUMBER.format(MAX_DELETES_PER_RUN)} files are deleted per night. Linking a
              file again before its date keeps it.
            </p>
          </InfoTip>
        </div>
      </header>

      <section className="space-y-5 rounded-2xl border border-vtk-blue/15 bg-white p-5 shadow-sm sm:p-6" aria-label="Status">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-vtk-ink">
              {settings.deleteEnabled ? 'Deletion is on' : 'Report only'}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500">
              {settings.deleteEnabled
                ? `The nightly run deletes files that have been unreferenced for ${GRACE_DAYS} days.`
                : 'Nothing is deleted. The nightly run only marks unreferenced files, so you can check the list below first.'}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {lastRun ? `Last scan: ${runLine(lastRun)}` : 'No scan has run yet. The first nightly run starts after 03:00.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SaveForm
              action={scanStorageNowAction}
              submitLabel="Scan now"
              submitVariant="ghost"
              savingLabel="Scanning..."
              savedMessage="Scan finished."
              errorMessages={errorMessages}
              fallbackErrorMessage="Scan failed, nothing was marked."
            />
            <SaveForm
              action={setStorageCleanupDeletionAction}
              submitLabel={settings.deleteEnabled ? 'Turn deletion off' : 'Turn deletion on'}
              submitVariant={settings.deleteEnabled ? 'ghost' : 'primary'}
              savingLabel="Saving..."
              savedMessage="Saved."
              fallbackErrorMessage="Could not change the cleanup setting."
              confirmSubmit={
                settings.deleteEnabled
                  ? null
                  : {
                      title: 'Turn deletion on?',
                      description: (
                        <>
                          From the next nightly run, a file that has been unreferenced for {GRACE_DAYS} days is
                          deleted from the bucket, at most {NUMBER.format(MAX_DELETES_PER_RUN)} per night.{' '}
                          {plural(report.dueCount, 'file is', 'files are')} due
                          now; the other {NUMBER.format(Math.max(0, report.orphanCount - report.dueCount))} follow on
                          their date unless they are linked again first. A deleted file cannot be restored, and
                          links to it shared outside the site stop working.
                        </>
                      ),
                      confirmLabel: 'Turn deletion on',
                      cancelLabel: 'Cancel',
                    }
              }
            >
              <input type="hidden" name="enabled" value={settings.deleteEnabled ? '0' : '1'} />
            </SaveForm>
          </div>
        </div>

        {lastRun?.status === 'failed' ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">
              The last scan failed, nothing was marked or deleted
              {ok ? `. The numbers below are from the scan of ${DATE_TIME.format(new Date(ok.finishedAt))}.` : ''}
            </p>
            <p className="mt-1 break-words text-amber-900/80">{lastRun.error}</p>
          </div>
        ) : null}
        {lastRun?.status === 'skipped' ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">The last scan was skipped</p>
            <p className="mt-1 text-amber-900/80">Object storage is not configured.</p>
          </div>
        ) : null}

        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Unreferenced</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-vtk-ink">{NUMBER.format(report.orphanCount)}</dd>
            <dd className="text-xs text-zinc-500">{formatBytes(report.orphanBytes)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Checked</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-vtk-ink">{ok ? NUMBER.format(ok.checked) : '–'}</dd>
            <dd className="text-xs text-zinc-500">
              {ok ? `${NUMBER.format(ok.referenced)} referenced, in ${NUMBER.format(ok.tables)} tables searched` : 'After the first scan'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Last run</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-vtk-ink">{ok ? NUMBER.format(ok.deleted) : '–'}</dd>
            <dd className="text-xs text-zinc-500">
              {ok
                ? `deleted (${formatBytes(ok.deletedBytes)}), ${NUMBER.format(ok.newOrphans)} newly marked, ${NUMBER.format(ok.released)} linked again${ok.deleteFailed ? `, ${NUMBER.format(ok.deleteFailed)} failed to delete` : ''}`
                : 'After the first scan'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Not judged</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-vtk-ink">
              {ok ? NUMBER.format(ok.tooRecent + ok.unrecognised) : '–'}
            </dd>
            <dd className="text-xs text-zinc-500">
              {ok
                ? `${NUMBER.format(ok.tooRecent)} younger than ${MIN_OBJECT_AGE_DAYS} days, ${NUMBER.format(ok.unrecognised)} with a key in an older format (always kept)`
                : 'After the first scan'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4 rounded-2xl border border-vtk-blue/15 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-vtk-ink">Unreferenced files</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Oldest first. Open a few to check that none of them is still in use somewhere; if one is, the scan
            misses a place where keys are stored, and deletion should stay off until that is fixed.
            {report.orphanCount > report.rows.length
              ? ` Showing the first ${NUMBER.format(report.rows.length)} of ${NUMBER.format(report.orphanCount)}.`
              : ''}
          </p>
        </div>

        {report.rows.length === 0 ? (
          <p className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
            {lastRun ? 'No unreferenced files. Everything in the bucket is in use.' : 'Nothing to show before the first scan.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="vtk-orphan-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Type</th>
                  <th className="text-right">Size</th>
                  <th>Unreferenced since</th>
                  <th>Deleted on</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => {
                  const url = publicUrl(row.key)!;
                  const isImage = IMAGE_PREFIXES.some((prefix) => row.key.startsWith(prefix));
                  const due = deletionDate(row.firstSeenAt);
                  const isDue = due.getTime() <= now.getTime();
                  return (
                    <tr key={row.key}>
                      <td data-wide>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 no-underline"
                        >
                          {isImage ? (
                            <Image
                              src={url}
                              alt=""
                              width={40}
                              height={40}
                              sizes="40px"
                              className="size-10 shrink-0 rounded-md border border-zinc-200 object-cover"
                            />
                          ) : (
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-[10px] font-semibold uppercase text-zinc-500">
                              {row.key.split('.').at(-1)?.slice(0, 4) || 'file'}
                            </span>
                          )}
                          <span className="break-all font-mono text-xs text-vtk-ink">{row.key}</span>
                        </a>
                      </td>
                      <td data-label="Type" className="text-sm text-zinc-600">{storageFeatureForKey(row.key).label}</td>
                      <td data-label="Size" className="whitespace-nowrap text-right tabular-nums text-zinc-600">{formatBytes(row.sizeBytes)}</td>
                      <td data-label="Unreferenced since" className="whitespace-nowrap tabular-nums text-zinc-600">{DATE.format(row.firstSeenAt)}</td>
                      <td data-label="Deleted on" className="tabular-nums text-zinc-600">
                        {isDue ? (settings.deleteEnabled ? 'Next nightly run' : 'Due, deletion is off') : DATE.format(due)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
