import { Suspense } from "react";
import { Card } from "@vtk/ui";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { discordGuildConfigured, listDiscordChannels } from "@/lib/discord/bot";
import { discordAccessStatus } from "@/lib/discord/pocAccess";
import { PocDiscordCard, PocDiscordCardPending } from "../PocDiscordCard";

/**
 * Tabblad Discord: het koppelbericht en hoe de rollen ervoor staan. Twee
 * aanroepen naar Discord en een telling over alle gekoppelde accounts, in een
 * eigen Suspense zodat de kop met de tabbladen er niet op wacht. De rollen per
 * POC kies je op het tabblad POC's.
 */
export default async function AdminPocsDiscord({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("pocs.manage");
  if (!discordGuildConfigured()) notFound();
  const nl = locale === "nl";
  return (
    <Suspense fallback={<PocDiscordCardPending nl={nl} />}>
      <PocDiscordSection nl={nl} />
    </Suspense>
  );
}

async function PocDiscordSection({ nl }: { nl: boolean }) {
  const [channels, status] = await Promise.all([listDiscordChannels(), discordAccessStatus()]);
  if (!channels) {
    return (
      <Card className="space-y-3 p-5">
        <h2 className="text-base font-semibold">Discord</h2>
        {/* Geen <p>: vtk-admin.css zet elke <p> in de admin in --muted. */}
        <div className="text-sm text-vtk-danger">
          {nl
            ? "Discord antwoordde niet. Laad de pagina straks opnieuw."
            : "Discord did not answer. Reload the page in a moment."}
        </div>
      </Card>
    );
  }
  return <PocDiscordCard locale={nl ? "nl" : "en"} status={status} channels={channels} />;
}
