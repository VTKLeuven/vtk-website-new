import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getGoogleConfig } from "@/lib/google/config";
import { ProvisionAccounts, type ProvisionRow } from "./ProvisionAccounts";
import { type TargetPlan, collectTargets, parseSourceKey } from "./targets";

/**
 * Accounts aanmaken vanuit de site.
 *
 * Het scherm toont eerst wat er zou gebeuren: per lid het voorgestelde adres en
 * de alias, met een vinkje. Een mailadres is achteraf lastig te veranderen, dus
 * er gaat niets naar Google voor iemand die lijst gezien heeft.
 */
export default async function AdminProvisionAccounts({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ bron?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("googleAccounts.manage");

  const { bron } = await searchParams;
  const base = `${nl ? "" : "/en"}/admin/groepsadressen`;
  const cfg = await getGoogleConfig();

  const [groups, kiesploegen] = await Promise.all([
    prisma.group.findMany({
      where: { active: true },
      select: { id: true, nameNl: true, nameEn: true, type: true },
      orderBy: { nameNl: "asc" },
    }),
    prisma.kiesploeg.findMany({
      select: { id: true, formalName: true },
      orderBy: { workingYear: "desc" },
    }),
  ]);

  const sources = [
    ...kiesploegen.map((k) => ({ value: `kiesploeg:${k.id}`, label: k.formalName })),
    ...groups.map((g) => ({
      value: `group:${g.id}`,
      label: `${nl ? g.nameNl : g.nameEn}${g.type === "WERKGROEP" ? (nl ? " (werkgroep)" : " (work group)") : ""}`,
    })),
  ];

  let plan: TargetPlan | null = null;
  let error: string | null = null;
  const source = bron ? parseSourceKey(bron) : null;
  if (cfg && source) {
    try {
      plan = await collectTargets(cfg, source);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const rows: ProvisionRow[] =
    plan?.rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      alias: row.alias,
      blocked: row.blocked,
    })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-vtk-ink">
          {nl ? "Accounts aanmaken" : "Create accounts"}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          {nl
            ? "Maakt een @-account per lid en koppelt het meteen aan zijn website-account. Wie hier een account krijgt, hoeft zich niet meer zelf te koppelen."
            : "Creates an account per member and links it to their website account right away. Whoever gets an account here does not need to link it themselves."}
        </p>
        <Link href={base} className="vtk-link mt-2 inline-block text-sm">
          {nl ? "Terug naar groepsadressen" : "Back to group addresses"}
        </Link>
      </div>

      {!cfg && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {nl
            ? "Google Workspace is nog niet ingesteld (Admin > IT)."
            : "Google Workspace is not set up yet (Admin > IT)."}
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}

      <ProvisionAccounts
        nl={nl}
        sources={sources}
        selectedSource={bron ?? ""}
        basePath={`${base}/accounts`}
        planLabel={plan?.label ?? null}
        isKiesploeg={Boolean(plan?.kiesploeg)}
        rows={rows}
        disabled={!cfg}
      />
    </div>
  );
}
