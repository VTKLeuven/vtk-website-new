import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { SentryTest } from "./SentryTest";

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

  // Read the DSN config server-side, where env vars are reliably available.
  // The client button uses NEXT_PUBLIC_SENTRY_DSN, the server button SENTRY_DSN.
  const dsnConfigured = Boolean(
    process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">IT</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Technical tools for administrators. Use the buttons to verify that
          Sentry (error monitoring) is receiving events.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Test Sentry</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Sends a test error to Sentry. Then check the Issues dashboard in
            Sentry; the event usually appears within ~30 seconds.
          </p>
        </div>
        <SentryTest dsnConfigured={dsnConfigured} />
      </section>
    </div>
  );
}
