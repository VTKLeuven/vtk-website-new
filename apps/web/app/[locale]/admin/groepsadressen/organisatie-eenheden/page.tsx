import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { type GoogleConfig, getGoogleConfig } from "@/lib/google/config";
import { listUsersLite } from "@/lib/google/client";
import { knownOrgUnits } from "@/lib/google/orgUnits";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { type OuAccount, OuManager } from "./OuManager";
import { OuRestore } from "./OuRestore";

/**
 * Welke `@vtk.be`-accounts in welke organisatie-eenheid staan, en ze in bulk
 * verplaatsen. Onderaan het terugzetten uit het logboek van de Admin console,
 * gebouwd na 16 november 2026 toen de sync tientallen accounts naar "/" zette;
 * dat heb je zelden nodig, dus het staat dicht.
 *
 * Leest de directory live, maar enkel de velden die het scherm toont
 * (`listUsersLite`), en in een eigen `Suspense`: de kop, de tabbladen en het
 * terugzetten staan er meteen, de tabel volgt zodra Google antwoordt.
 */
export default async function OrgUnitsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("googleAccounts.manage");

  const cfg = await getGoogleConfig();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-vtk-ink">{nl ? "Organisatie-eenheden" : "Organisational units"}</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          {nl
            ? "Welk @vtk.be-account in welke organisatie-eenheid staat. Vink accounts aan en verplaats ze; de regels van de nieuwe OU (wie mag mailen, welke apps) gelden meteen. Mail, bestanden en groepen blijven zoals ze zijn."
            : "Which @vtk.be account is in which organisational unit. Select accounts and move them; the rules of the new OU (who may send mail, which apps) apply right away. Mail, files and groups stay as they are."}
        </p>
      </div>

      {!cfg ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {nl ? "Google Workspace is nog niet ingesteld (Admin > IT)." : "Google Workspace is not set up yet (Admin > IT)."}
        </p>
      ) : (
        <>
          <Suspense
            fallback={
              <div className="rounded-2xl border border-vtk-blue/15 bg-white px-4 py-6 text-sm text-zinc-500" aria-busy="true">
                {nl ? "Bezig met de accounts uit Google te lezen..." : "Reading the accounts from Google..."}
              </div>
            }
          >
            <Accounts cfg={cfg} nl={nl} />
          </Suspense>

          <AdminDisclosure
            summary={
              <span>
                <span className="font-semibold text-vtk-ink">
                  {nl ? "Terugzetten uit het logboek" : "Restore from the log"}
                </span>
                <span className="block text-sm text-zinc-500">
                  {nl
                    ? "De site leest de verhuizingen in een periode uit het logboek van de Admin console en zet die accounts terug waar ze stonden."
                    : "The site reads the moves in a period from the Admin console log and puts those accounts back where they were."}
                </span>
              </span>
            }
          >
            {/* Standaard de middag van 16 november 2026, toen de sync accounts naar "/" zette. */}
            <OuRestore nl={nl} defaultSince="2026-11-16T14:30" />
          </AdminDisclosure>
        </>
      )}
    </div>
  );
}

async function Accounts({ cfg, nl }: { cfg: GoogleConfig; nl: boolean }) {
  let directory: Awaited<ReturnType<typeof listUsersLite>>;
  try {
    directory = await listUsersLite(cfg);
  } catch (err) {
    return (
      <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
        {nl ? "De directory kon niet gelezen worden: " : "The directory could not be read: "}
        {err instanceof Error ? err.message : String(err)}
      </p>
    );
  }

  const year = currentWorkingYear();
  const linked = await prisma.user.findMany({
    where: { googleUserId: { in: directory.map((u) => u.id) }, deletedAt: null },
    select: {
      name: true,
      googleUserId: true,
      memberships: { where: { year }, take: 1, select: { group: { select: { nameNl: true, nameEn: true } } } },
    },
  });
  const byGoogleId = new Map(linked.map((u) => [u.googleUserId as string, u]));

  const accounts: OuAccount[] = directory
    .map((u) => {
      const member = byGoogleId.get(u.id);
      const post = member?.memberships[0]?.group;
      return {
        email: u.primaryEmail.toLowerCase(),
        name: u.name?.fullName ?? null,
        ou: u.orgUnitPath ?? "/",
        suspended: Boolean(u.suspended),
        member: member?.name ?? null,
        post: post ? (nl ? post.nameNl : post.nameEn) : null,
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <OuManager
      nl={nl}
      accounts={accounts}
      orgUnits={knownOrgUnits(directory, cfg)}
      restrictedOrgUnits={[cfg.restrictedOrgUnit, cfg.aliasSenderOrgUnit].filter((x): x is string => Boolean(x))}
    />
  );
}
