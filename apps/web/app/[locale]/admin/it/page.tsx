import { notFound } from "next/navigation";
import { Card } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { getS3Status, getSentryStatus } from "@/lib/runtimeConfig";
import { getDoorStatus } from "@/lib/door-config";
import { SentryTest } from "./SentryTest";
import { S3ConfigForm } from "./S3ConfigForm";
import { SentryConfigForm } from "./SentryConfigForm";
import { DoorConfigForm } from "./DoorConfigForm";
import { DoorTestButton } from "./DoorTestButton";

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

  const [s3Status, sentryStatus, doorStatus] = await Promise.all([
    getS3Status(),
    getSentryStatus(),
    getDoorStatus(),
  ]);

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
    </div>
  );
}
