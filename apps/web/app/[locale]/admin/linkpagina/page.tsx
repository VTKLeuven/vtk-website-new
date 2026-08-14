import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { LINK_PAGE_SETTING_KEY, parseLinkPageConfig } from "@/lib/link-page";
import { LinkPageManager } from "./LinkPageManager";

export default async function AdminLinkPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("home.edit");

  const setting = await prisma.setting.findUnique({ where: { key: LINK_PAGE_SETTING_KEY } });
  const config = parseLinkPageConfig(setting?.value);
  const nl = locale === "nl";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Linktree</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            {nl
              ? "Beheer de compacte Linktree waar bezoekers vanuit Instagram en andere sociale media terechtkomen. Wijzigingen verschijnen meteen op de publieke pagina."
              : "Manage the compact Linktree visitors reach from Instagram and other social media. Changes appear on the public page immediately."}
          </p>
        </div>
        <Link
          href="/links"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center rounded-full border border-vtk-blue/15 bg-white px-4 text-sm font-medium text-vtk-ink shadow-sm transition hover:border-vtk-blue/30 hover:bg-vtk-blue-soft"
        >
          {nl ? "Publieke pagina bekijken ↗" : "View public page ↗"}
        </Link>
      </header>

      <LinkPageManager initialConfig={config} locale={locale} />
    </div>
  );
}
