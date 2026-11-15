import { notFound } from "next/navigation";
import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getGoogleConfig } from "@/lib/google/config";
import { type GoogleGroup, listGroups } from "@/lib/google/client";
import { ImportGroups } from "./ImportGroups";

/**
 * Bestaande Google-groepen overnemen, zodat ze voortaan vanuit de site beheerd
 * worden in plaats van in de Admin console.
 *
 * Leest de groepen live uit Google: wat hier staat, is wat er nu is. Enkel de
 * groepen die de site nog niet kent, verschijnen.
 */
export default async function ImportMailGroups({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("mailgroups.manage");
  const base = `${nl ? "" : "/en"}/admin/groepsadressen`;

  const cfg = await getGoogleConfig();
  let groups: GoogleGroup[] = [];
  let error: string | null = null;
  if (cfg) {
    try {
      groups = await listGroups(cfg);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const known = new Set(
    (await prisma.mailGroup.findMany({ select: { email: true } })).map((g) => g.email),
  );
  const rows = groups
    .filter((g) => !known.has(g.email.toLowerCase()))
    .map((g) => ({
      email: g.email.toLowerCase(),
      name: g.name,
      members: Number(g.directMembersCount ?? 0),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div className="space-y-6">
      <div>
        <Link href={base} className="vtk-link text-sm">
          {nl ? "Groepsadressen" : "Group addresses"}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-vtk-ink">
          {nl ? "Overnemen uit Google" : "Take over from Google"}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          {nl
            ? "De groepen die nu enkel in de Admin console beheerd worden. Overnemen verandert niets in Google: wie er nu als lid in staat, komt mee als los lid (een lid van de site wanneer het zijn gekoppeld account is). Daarna kan je per adres de post, de POC of de werkgroep als bron zetten en de overgenomen adressen wissen. Eigenaars en beheerders van de groep blijven staan en worden nooit aangeraakt."
            : "The groups that are only managed in the Admin console today. Taking over changes nothing in Google: whoever is a member now comes along as a loose member (a site member when it is their linked account). Afterwards you can set the post, POC or work group as source per address and clear the imported addresses. Owners and managers of the group stay and are never touched."}
        </p>
        <p className="mt-2 max-w-3xl text-sm text-zinc-500">
          {nl
            ? "Een overgenomen groep krijgt de standaardinstellingen van VTK: iedereen mag posten en de eigenaars contacteren, enkel leden zien de gesprekken en de ledenlijst, enkel eigenaars en beheerders beheren de leden. Was de groep enkel intern bereikbaar, dan blijft dat zo."
            : "A group taken over gets VTK's default settings: anyone can post and contact the owners, only members see the conversations and the member list, only owners and managers manage members. If the group was internal only, it stays that way."}
        </p>
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
          {nl ? "Google gaf geen lijst terug: " : "Google returned no list: "}
          {error}
        </p>
      )}

      {cfg && !error && <ImportGroups nl={nl} rows={rows} />}
    </div>
  );
}
