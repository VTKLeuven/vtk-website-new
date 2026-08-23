import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { getS3Status, getSentryStatus } from "@/lib/runtimeConfig";
import { getDoorStatus } from "@/lib/door-config";
import { SentryTest } from "./SentryTest";
import { S3ConfigForm } from "./S3ConfigForm";
import { SentryConfigForm } from "./SentryConfigForm";
import { DoorConfigForm } from "./DoorConfigForm";
import { DoorTestButton } from "./DoorTestButton";
import { VaultConfigForm } from "./VaultConfigForm";
import { getVaultStatus } from "@/lib/vault/config";
import { GoogleConfigForm } from "./GoogleConfigForm";
import { getGoogleStatus } from "@/lib/google/config";

// This is an internal, superadmin-only tooling page, so the copy stays in
// English (technical terms) rather than being localized like the public admin.
export default async function AdminIT({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();

  // IT tab is superadmin-only (same gate as in the admin-nav filter).
  const session = await requireSession();
  if (!session.user.isSuperAdmin) notFound();

  const [s3Status, sentryStatus, doorStatus, vaultStatus, googleStatus] = await Promise.all([
    getS3Status(),
    getSentryStatus(),
    getDoorStatus(),
    getVaultStatus(),
    getGoogleStatus(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuration</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Technical configuration and tools for administrators. Sensitive keys are stored
          encrypted and never shown again after saving.
        </p>
      </div>

      <div className="space-y-4">
        {/* Object storage (S3) */}
        <details className="group rounded-2xl border border-vtk-blue/15 bg-white p-5 shadow-sm transition">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 select-none">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-vtk-ink">Object storage (S3)</h2>
                <span className="rounded-full bg-vtk-blue/10 px-2 py-0.5 text-xs font-medium text-vtk-ink">
                  {s3Status.source === "database"
                    ? "Database"
                    : s3Status.source === "environment"
                      ? "Env"
                      : "Unconfigured"}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500 line-clamp-1 group-open:line-clamp-none">
                Where uploaded logos, images, documents and photos are stored. Changes apply immediately.
              </p>
            </div>
            <span className="text-zinc-400 group-open:rotate-180 transition-transform duration-200 shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </summary>
          <div className="mt-6 border-t border-vtk-blue/10 pt-5">
            <S3ConfigForm status={s3Status} />
          </div>
        </details>

        {/* Sentry */}
        <details className="group rounded-2xl border border-vtk-blue/15 bg-white p-5 shadow-sm transition">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 select-none">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-vtk-ink">Sentry (error monitoring)</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    sentryStatus.hasDsn
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {sentryStatus.hasDsn ? "Configured" : "Inactive"}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500 line-clamp-1 group-open:line-clamp-none">
                Configure the Sentry DSN and verify that error events are received.
              </p>
            </div>
            <span className="text-zinc-400 group-open:rotate-180 transition-transform duration-200 shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </summary>
          <div className="mt-6 space-y-6 border-t border-vtk-blue/10 pt-5">
            <SentryConfigForm status={sentryStatus} />

            <div className="border-t border-vtk-blue/10 pt-5">
              <h3 className="text-sm font-semibold">Test Sentry</h3>
              <p className="mb-3 mt-1 text-sm text-zinc-500">
                Sends a test error to Sentry. Then check the Issues dashboard; the event usually
                appears within ~30 seconds.
              </p>
              <SentryTest dsnConfigured={sentryStatus.hasDsn} />
            </div>
          </div>
        </details>

        {/* Door scanner */}
        <details className="group rounded-2xl border border-vtk-blue/15 bg-white p-5 shadow-sm transition">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 select-none">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-vtk-ink">Door scanner</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    doorStatus.hasSecret && doorStatus.piUrl
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {doorStatus.hasSecret && doorStatus.piUrl ? "Configured" : "Needs setup"}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500 line-clamp-1 group-open:line-clamp-none">
                The KU Leuven card scanner at the door, driven by a Raspberry Pi on the tailnet.
              </p>
            </div>
            <span className="text-zinc-400 group-open:rotate-180 transition-transform duration-200 shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </summary>
          <div className="mt-6 space-y-6 border-t border-vtk-blue/10 pt-5">
            <DoorConfigForm status={doorStatus} />

            <div className="border-t border-vtk-blue/10 pt-5">
              <h3 className="text-sm font-semibold">Test connection</h3>
              <p className="mb-3 mt-1 text-sm text-zinc-500">
                Pings the Pi&apos;s /health endpoint with the saved secret over Tailscale.
              </p>
              <DoorTestButton />
            </div>
          </div>
        </details>

        <details className="group rounded-2xl border border-vtk-blue/15 bg-white p-5">
          <summary className="flex cursor-pointer items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Password vault</h2>
                <span className="rounded-full border border-vtk-blue/15 px-2 py-0.5 text-xs text-zinc-500">
                  {vaultStatus.configured ? "Configured" : "Needs setup"}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500 line-clamp-1 group-open:line-clamp-none">
                Vaultwarden: shared passwords per post, with membership following the working year.
                The organisation key stored here can decrypt every shared password; see
                docs/wachtwoorden.md.
              </p>
            </div>
            <span className="text-zinc-400 group-open:rotate-180 transition-transform duration-200 shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </summary>
          <div className="mt-6 space-y-6 border-t border-vtk-blue/10 pt-5">
            <VaultConfigForm status={vaultStatus} />
          </div>
        </details>

        <details className="group rounded-2xl border border-vtk-blue/15 bg-white p-5">
          <summary className="flex cursor-pointer items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Google Workspace</h2>
                <span className="rounded-full border border-vtk-blue/15 px-2 py-0.5 text-xs text-zinc-500">
                  {googleStatus.configured ? "Configured" : "Needs setup"}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500 line-clamp-1 group-open:line-clamp-none">
                Group addresses (activiteiten@vtk.be, ...) whose members follow the posts of the
                working year. Manage the lists under Admin &gt; Group addresses; this is the
                service account they run on. Not related to the Brevo mailing lists.
              </p>
            </div>
            <span className="text-zinc-400 group-open:rotate-180 transition-transform duration-200 shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </summary>
          <div className="mt-6 space-y-6 border-t border-vtk-blue/10 pt-5">
            <GoogleConfigForm status={googleStatus} />
          </div>
        </details>
      </div>
    </div>
  );
}
