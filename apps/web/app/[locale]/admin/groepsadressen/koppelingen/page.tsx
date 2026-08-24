import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getGoogleConfig } from "@/lib/google/config";
import { collectLinkCandidates } from "@/lib/google/link";
import { GoogleLinks } from "./GoogleLinks";

/**
 * De eenmalige inhaalslag: bestaande `@vtk.be`-accounts aan hun website-lid
 * hangen. Nieuwe accounts worden door de site aangemaakt en leden kunnen zich
 * zelf koppelen; dit scherm is voor alles wat er al was.
 *
 * Zonder koppeling weet de sync geen adres en valt iemand stil uit elke lijst,
 * dus dit scherm hoort bij de groepsadressen en niet bij het gebruikersbeheer.
 */
export default async function AdminGoogleLinks({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("mailgroups.manage");

  const back = `${nl ? "" : "/en"}/admin/groepsadressen`;
  const cfg = await getGoogleConfig();
  if (!cfg) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold text-vtk-ink">
          {nl ? "Accounts koppelen" : "Link accounts"}
        </h1>
        <p className="text-sm text-zinc-500">
          {nl
            ? "Google Workspace is nog niet ingesteld (Admin > IT). Zonder koppeling kan de directory niet uitgelezen worden."
            : "Google Workspace is not set up yet (Admin > IT). Without it the directory cannot be read."}
        </p>
        <Link href={back} className="vtk-link text-sm">
          {nl ? "Terug naar groepsadressen" : "Back to group addresses"}
        </Link>
      </div>
    );
  }

  const linked = await prisma.user.findMany({
    where: { googleUserId: { not: null }, deletedAt: null },
    select: { id: true, name: true, googleEmail: true },
    orderBy: { name: "asc" },
  });

  // Google onbereikbaar is verwacht (een verlopen sleutel, een netwerkhapering):
  // dat hoort een leesbare melding te geven, geen error boundary.
  let candidates = null;
  let error: string | null = null;
  try {
    candidates = await collectLinkCandidates(cfg);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <GoogleLinks
      nl={nl}
      backHref={back}
      domain={cfg.domain}
      error={error}
      matches={candidates?.matches ?? []}
      ambiguous={candidates?.ambiguous ?? []}
      unmatched={candidates?.unmatched ?? []}
      users={candidates?.users ?? []}
      linked={linked.map((u) => ({ id: u.id, name: u.name, email: u.googleEmail ?? "" }))}
    />
  );
}
