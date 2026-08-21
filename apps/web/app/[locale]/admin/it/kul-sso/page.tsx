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
import { clearKulAuthLogsAction } from "@/app/actions/it";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { KulDebugForm } from "../KulDebugForm";
import { KulAuthLogViewer } from "../KulAuthLogViewer";

// Internal, superadmin-only tooling: copy stays in English (technical terms).
export default async function KulSsoAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();

  // IT tab is superadmin-only (same gate as in the admin-nav filter).
  const session = await requireSession();
  if (!session.user.isSuperAdmin) notFound();

  const [kulDebugEnabled, kulLogs] = await Promise.all([
    isKulDebugEnabled(),
    getKulAuthLogs(),
  ]);
  const kulConfigured = isKulEnabled();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">KU Leuven SSO</h1>
        <p className="mt-1 text-sm text-zinc-500">
          KU Leuven OIDC configuration, claim debug logging, and inspection of received ICTS identity attributes.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Debug logging</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {kulConfigured
              ? "Optionally log the claims KU Leuven returns on each login. "
              : "The KU Leuven OIDC provider is not configured in this environment (the KUL_OIDC_* env vars are absent), so no logins can be captured here yet. "}
            Use this to verify which attributes ICTS actually releases; for example whether
            the faculty / employee type comes through. The login explicitly fetches KU
            Leuven&apos;s userinfo endpoint and merges those attributes with the ID-token
            claims. Captured claims contain personal data, so this is off by default and only
            the last {KUL_LOG_KEEP} logins are kept.
          </p>
        </div>

        <div className="border-t border-vtk-blue/10 pt-4">
          <KulDebugForm enabled={kulDebugEnabled} />
        </div>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Captured logins</h2>
            <p className="text-xs text-zinc-500">
              Last {kulLogs.length} of max {KUL_LOG_KEEP} logins stored.
            </p>
          </div>
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

        <KulAuthLogViewer logs={kulLogs} />
      </section>
    </div>
  );
}
