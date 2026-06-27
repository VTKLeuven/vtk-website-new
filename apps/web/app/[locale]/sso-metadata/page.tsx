import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { ssoMetadata } from "@/lib/sso";

/**
 * Superadmin-only reference page listing the exact values to register in the
 * KU Leuven Shibboleth tool. All host-dependent values are computed from
 * BETTER_AUTH_URL, so opening this page on any deployment shows the strings
 * that are correct for that deployment.
 */
export default async function SsoMetadataPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();

  const session = await requireSession(
    `/inloggen?next=${locale === "nl" ? "" : "/en"}/sso-metadata`
  );
  if (!session.user.isSuperAdmin) notFound();

  const m = ssoMetadata();

  const rows: { label: string; value: string }[] = [
    { label: "Entity ID (client_id)", value: m.entityId },
    { label: "Redirect URI", value: m.redirectUri },
    { label: "Information URL", value: m.infoUrl },
    { label: "Privacy Statement URL", value: m.privacyUrl },
    { label: "Logo URL", value: m.logoUrl },
    { label: "Logo width", value: String(m.logoWidth) },
    { label: "Logo height", value: String(m.logoHeight) },
  ];

  return (
    <div className="vtk-page vtk-page-shell vtk-page-narrow space-y-6">
      <div>
        <div className="vtk-page-kicker">VTK · KU Leuven SSO</div>
        <h1 className="text-4xl font-semibold tracking-tight text-vtk-ink">
          Shibboleth registration values
        </h1>
        <p className="mt-3 leading-relaxed text-[#3a4255]">
          Copy these into the KU Leuven Shibboleth tool. Host-dependent values are derived from
          BETTER_AUTH_URL ({m.base || "not set"}), so they stay correct for this deployment.
        </p>
      </div>

      <dl className="divide-y divide-vtk-blue/10 rounded-[18px] border border-vtk-blue/10 bg-white">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-1 gap-1 p-4 sm:grid-cols-[220px_1fr]">
            <dt className="text-sm font-medium text-[#5c667f]">{row.label}</dt>
            <dd className="break-all font-mono text-sm text-vtk-ink">{row.value}</dd>
          </div>
        ))}
      </dl>

      {!m.base && (
        <p className="text-sm text-[#b42318]">
          BETTER_AUTH_URL is not set in this environment, so the URLs above are incomplete.
        </p>
      )}
    </div>
  );
}
