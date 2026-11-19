import { notFound } from "next/navigation";
import { Card } from "@vtk/ui";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { discordGuildConfigured } from "@/lib/discord/bot";
import { hasLocale } from "@/lib/locale";
import { managedPocIds } from "@/lib/pocPolls/access";
import { pollStatus } from "@/lib/pocPolls/core";
import { getAuthorizationPreview, requireSession } from "@/lib/session";
import { PocChannelsCard } from "./PocChannelsCard";
import { PollStatusPill, pollDateLabel } from "./PollStatusPill";

/**
 * /admin/peilingen: de peilingen van je POC. De RiVers van dit werkingsjaar zien
 * die van hun eigen POC, zonder apart recht; wie `pocs.manage` heeft, ziet alles.
 */
export default async function AdminPeilingen({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const session = await requireSession(`${base}/inloggen?next=${base}/admin/peilingen`);
  const scope = await managedPocIds(session);
  if (scope !== "all" && scope.length === 0) notFound();

  // De POC's voor de kaart met Discord-kanalen; de kanalen zelf vraagt die kaart
  // pas op wanneer ze opengeklapt wordt (zie PocChannelsCard).
  const pocsQuery =
    scope === "all" && discordGuildConfigured()
      ? prisma.poc.findMany({
          orderBy: { order: "asc" },
          select: { id: true, nameNl: true, discordChannelId: true, _count: { select: { discordRoles: true } } },
        })
      : Promise.resolve([]);
  const pollsQuery = prisma.pocPoll.findMany({
    where: scope === "all" ? {} : { pocId: { in: scope } },
    orderBy: [{ closesAt: "desc" }],
    select: {
      id: true,
      titleNl: true,
      publishedAt: true,
      opensAt: true,
      closesAt: true,
      poc: { select: { nameNl: true } },
      questions: { select: { answers: { distinct: ["voterKey"], select: { voterKey: true } } } },
    },
  });
  const [polls, pocs] = await Promise.all([pollsQuery, pocsQuery]);
  const now = new Date();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{nl ? "Peilingen" : "Polls"}</h1>
          <p className="mt-1 max-w-3xl text-sm text-vtk-muted">
            {nl
              ? scope === "all"
                ? "Vraag de studenten van een richting, of van alle richtingen samen, wat ze vinden. Een algemene peiling en een van een POC lopen naast elkaar."
                : "Vraag de studenten van je richting wat ze vinden, zodat je op de POC meer kan brengen dan je eigen mening."
              : scope === "all"
                ? "Ask the students of one programme, or of all programmes together, what they think. A general poll and a POC poll run side by side."
                : "Ask the students of your programme what they think, so you can bring more to the POC than your own opinion."}
          </p>
        </div>
        <Link
          href={`${base}/admin/peilingen/nieuw`}
          className="inline-flex h-10 items-center rounded-full border border-vtk-ink bg-vtk-ink px-4 text-sm font-medium text-vtk-surface"
        >
          {nl ? "Nieuwe peiling" : "New poll"}
        </Link>
      </header>

      {polls.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-vtk-muted">
            {nl
              ? "Er zijn nog geen peilingen. Maak er een aan met de knop hierboven."
              : "There are no polls yet. Create one with the button above."}
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vtk-blue/10 text-left text-xs text-vtk-muted">
                <th className="px-4 py-3 font-medium">{nl ? "Peiling" : "Poll"}</th>
                <th className="px-4 py-3 font-medium">POC</th>
                <th className="px-4 py-3 font-medium">{nl ? "Status" : "Status"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "Sluit" : "Closes"}</th>
                <th className="px-4 py-3 !text-right font-medium">{nl ? "Antwoorden" : "Responses"}</th>
              </tr>
            </thead>
            <tbody>
              {polls.map((poll) => {
                const href = `${base}/admin/peilingen/${poll.id}`;
                const voters = new Set(poll.questions.flatMap((q) => q.answers.map((a) => a.voterKey))).size;
                return (
                  <LinkedRow key={poll.id} href={href} className="cursor-pointer border-b border-vtk-blue/10 last:border-0 hover:bg-vtk-blue-soft/40">
                    <td className="px-4 py-3 font-medium">
                      <Link href={href}>{poll.titleNl}</Link>
                    </td>
                    <td className="px-4 py-3">
                      {poll.poc ? poll.poc.nameNl.replace(/^POC\s+/i, "") : nl ? "Alle richtingen" : "All programmes"}
                    </td>
                    <td className="px-4 py-3">
                      <PollStatusPill status={pollStatus(poll, now)} nl={nl} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">{pollDateLabel(poll.closesAt, nl)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{voters}</td>
                  </LinkedRow>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {scope === "all" && discordGuildConfigured() ? (
        <PocChannelsCard
          nl={nl}
          preview={(await getAuthorizationPreview()) !== null}
          rolesHref={`${base}/admin/pocs`}
          pocs={pocs.map((poc) => ({
            id: poc.id,
            name: poc.nameNl.replace(/^POC\s+/i, ""),
            channelId: poc.discordChannelId ?? "",
            hasRole: poc._count.discordRoles > 0,
          }))}
        />
      ) : null}
    </div>
  );
}
