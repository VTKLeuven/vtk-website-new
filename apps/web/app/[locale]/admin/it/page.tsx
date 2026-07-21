import { notFound } from "next/navigation";
import { Card } from "@vtk/ui";
import {
  isKulEnabled,
  isKulDebugEnabled,
  getKulAuthLogs,
  KUL_LOG_KEEP,
} from "@vtk/auth/server";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { getS3Status, getSentryStatus } from "@/lib/runtimeConfig";
import { getDoorStatus } from "@/lib/door-config";
import { clearKulAuthLogsAction } from "@/app/actions/it";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { SentryTest } from "./SentryTest";
import { S3ConfigForm } from "./S3ConfigForm";
import { SentryConfigForm } from "./SentryConfigForm";
import { DoorConfigForm } from "./DoorConfigForm";
import { DoorTestButton } from "./DoorTestButton";
import { KulDebugForm } from "./KulDebugForm";
import { KulAuthLogViewer } from "./KulAuthLogViewer";

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

  const [s3Status, sentryStatus, doorStatus, kulDebugEnabled, kulLogs] =
    await Promise.all([
      getS3Status(),
      getSentryStatus(),
      getDoorStatus(),
      isKulDebugEnabled(),
      getKulAuthLogs(),
    ]);
  const kulConfigured = isKulEnabled();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">IT</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Technical configuration and tools for administrators. Sensitive keys are stored
          encrypted and never shown again after saving.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Object storage (S3)</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Where uploaded logos, images, documents and photos are stored. Changes apply
            immediately (no restart needed).
          </p>
        </div>
        <Card className="p-5">
          <S3ConfigForm status={s3Status} />
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Sentry (error monitoring)</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Configure the Sentry DSN, then use the buttons to verify that events are received.
          </p>
        </div>
        <Card className="space-y-6 p-5">
          <SentryConfigForm status={sentryStatus} />

          <div className="border-t border-vtk-blue/10 pt-5">
            <h3 className="text-sm font-semibold">Test Sentry</h3>
            <p className="mb-3 mt-1 text-sm text-zinc-500">
              Sends a test error to Sentry. Then check the Issues dashboard; the event usually
              appears within ~30 seconds.
            </p>
            <SentryTest dsnConfigured={sentryStatus.hasDsn} />
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Door scanner</h2>
          <p className="mt-1 text-sm text-zinc-500">
            The KU Leuven card scanner at the door, driven by a Raspberry Pi on the tailnet. The
            shared secret authenticates the Pi calling the door API and the server calling the Pi to
            open remotely. Who may open with a card is managed via the door.* permissions in{" "}
            /admin/roles and /admin/deur.
          </p>
        </div>
        <Card className="space-y-6 p-5">
          <DoorConfigForm status={doorStatus} />

          <div className="border-t border-vtk-blue/10 pt-5">
            <h3 className="text-sm font-semibold">Test connection</h3>
            <p className="mb-3 mt-1 text-sm text-zinc-500">
              Pings the Pi&apos;s /health endpoint with the saved secret over Tailscale.
            </p>
            <DoorTestButton />
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">KU Leuven SSO (OIDC)</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {kulConfigured
              ? "Optionally log the claims KU Leuven returns on each login. "
              : "The KU Leuven OIDC provider is not configured in this environment (the KUL_OIDC_* env vars are absent), so no logins can be captured here yet. "}
            Use this to verify which attributes ICTS actually releases; for example whether
            the faculty / employee type comes through. Note that better-auth reads the ID
            token first: attributes KU Leuven only releases at the userinfo endpoint may not
            appear here. Captured claims contain personal data, so this is off by default and
            only the last {KUL_LOG_KEEP} logins are kept.
          </p>
        </div>
        <Card className="space-y-6 p-5">
          <KulDebugForm enabled={kulDebugEnabled} />

          <div className="border-t border-vtk-blue/10 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Captured logins</h3>
              {kulLogs.length > 0 && (
                <DeleteButton
                  action={clearKulAuthLogsAction}
                  fields={{}}
                  title="Clear KU Leuven auth logs"
                  description={`This permanently deletes all ${kulLogs.length} captured login claim set(s). The toggle stays as-is, so new logins are captured again while logging is on.`}
                  confirmLabel="Clear logs"
                  cancelLabel="Cancel"
                  successMessage="KU Leuven auth logs cleared."
                >
                  Clear logs
                </DeleteButton>
              )}
            </div>
            <div className="mt-3">
              <KulAuthLogViewer logs={kulLogs} />
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
