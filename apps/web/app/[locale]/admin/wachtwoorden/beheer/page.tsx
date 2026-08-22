import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getVaultStatus, vaultPublicUrl } from "@/lib/vault/config";
import { VaultAdmin, type PostRow } from "./VaultAdmin";

/**
 * Kluisbeheer voor IT: welke posten gekoppeld zijn, waar de synchronisatie staat
 * en of de koppeling ingesteld is.
 *
 * De configuratie zelf (URL, organisatie, API-key en de organisatiesleutel)
 * wordt niet hier ingevuld maar bij Admin -> IT, bij de andere runtime-config.
 */
export default async function AdminVaultBeheer({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("vault.manage");

  const year = currentWorkingYear();
  const [groups, vaultPosts, members, status, clientUrl] = await Promise.all([
    prisma.group.findMany({
      where: { active: true },
      select: {
        id: true,
        nameNl: true,
        _count: { select: { memberships: { where: { year } } } },
      },
      orderBy: { nameNl: "asc" },
    }),
    prisma.vaultPost.findMany({
      select: { groupId: true, enabled: true, lastSyncAt: true, lastError: true },
    }),
    prisma.vaultMember.findMany({
      select: { status: true, user: { select: { memberships: { where: { year }, select: { groupId: true } } } } },
    }),
    getVaultStatus(),
    vaultPublicUrl(),
  ]);

  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Per post tellen hoeveel leden al bevestigd zijn en hoeveel er nog op hun
  // eerste login wachten. Dat onderscheid is het hele verhaal van dit scherm:
  // "uitgenodigd" is een wachtstand aan de kant van het lid, geen storing.
  const byGroup = new Map<string, { invited: number; confirmed: number }>();
  for (const m of members) {
    for (const membership of m.user.memberships) {
      const entry = byGroup.get(membership.groupId) ?? { invited: 0, confirmed: 0 };
      if (m.status === "CONFIRMED") entry.confirmed += 1;
      else entry.invited += 1;
      byGroup.set(membership.groupId, entry);
    }
  }

  const linked = new Map(vaultPosts.map((v) => [v.groupId, v]));
  const rows: PostRow[] = groups.map((g) => {
    const vault = linked.get(g.id);
    const counts = byGroup.get(g.id) ?? { invited: 0, confirmed: 0 };
    return {
      groupId: g.id,
      name: g.nameNl,
      memberCount: g._count.memberships,
      linked: Boolean(vault?.enabled),
      lastSyncLabel: vault?.lastSyncAt ? dateFmt.format(vault.lastSyncAt) : null,
      lastError: vault?.lastError ?? null,
      invited: vault?.enabled ? counts.invited : 0,
      confirmed: vault?.enabled ? counts.confirmed : 0,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "Kluisbeheer" : "Vault management"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? "Welke posten hun wachtwoorden via de kluis delen, en waar de synchronisatie staat."
            : "Which posts share their passwords through the vault, and where the synchronisation stands."}
        </p>
      </div>

      {!status.configured ? (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          {nl
            ? "De koppeling is nog niet volledig ingesteld. Vul bij Admin -> IT het adres van de kluis, de organisatie, de API-key van het botaccount en de organisatiesleutel in. Zie docs/wachtwoorden.md."
            : "The integration is not fully set up. At Admin -> IT, fill in the vault address, the organisation, the bot account's API key and the organisation key. See docs/wachtwoorden.md."}
        </p>
      ) : (
        <p className="rounded-2xl border border-vtk-blue/15 bg-white p-5 text-sm text-zinc-600">
          {nl ? "Kluis: " : "Vault: "}
          <span className="font-mono text-xs text-vtk-ink">{clientUrl ?? status.url}</span>
        </p>
      )}

      <VaultAdmin nl={nl} posts={rows} />
    </div>
  );
}
