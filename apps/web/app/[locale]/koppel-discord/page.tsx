import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@vtk/ui";
import { linkDiscordAccountAction } from "@/app/actions/discord-link";
import { DiscordLinkForm } from "@/components/profile/DiscordLinkForm";
import { discordLinkLabels } from "@/lib/discord/linkCopy";
import { readDiscordLinkToken } from "@/lib/discord/linkToken";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Discord koppelen",
  robots: { index: false, follow: false },
};

/**
 * Hier komt wie op Discord op een peiling klikt zonder gekoppeld account. Discord
 * zegt welk account klikte, de aanmelding op de site wie die persoon is.
 */
export default async function KoppelDiscordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const { token = "" } = await searchParams;

  await requireSession(
    `${base}/inloggen?next=${encodeURIComponent(`${base}/koppel-discord?token=${token}`)}`,
  );
  const link = readDiscordLinkToken(token);

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">{nl ? "Discord koppelen" : "Link Discord"}</h1>
        </div>
      </header>
      <div className="vtk-page-shell">
        <Card className="max-w-xl p-6">
          {link ? (
            <DiscordLinkForm
              token={token}
              labels={discordLinkLabels(nl, link.username)}
              action={linkDiscordAccountAction}
            />
          ) : (
            <p className="text-sm text-vtk-body">
              {nl
                ? "Deze link is verlopen of ongeldig. Klik opnieuw op de knop van de peiling in Discord om een nieuwe te krijgen."
                : "This link has expired or is not valid. Press the button of the poll in Discord again to get a new one."}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
