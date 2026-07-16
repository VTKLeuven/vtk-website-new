import { prisma } from "@vtk/db";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { ShortLinksManager, type LinkRow } from "./ShortLinksManager";

// Short-link host shown in the UI, derived from the host the admin panel is
// being viewed on so it always matches the environment: vtk.be -> on.vtk.be,
// main-dev.vtk.be -> on.main-dev.vtk.be. Mirrors the "on." convention in proxy.ts.
function shortlinkDisplayHost(requestHost: string): string {
  const [hostname, port] = requestHost.split(":");
  const labels = hostname.split(".");
  let target: string;
  if (labels[0] === "on") target = hostname;
  else if (labels[0] === "www") {
    labels[0] = "on";
    target = labels.join(".");
  } else {
    target = `on.${hostname}`;
  }
  return port ? `${target}:${port}` : target;
}

export default async function AdminShortLinks({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("shortlinks.manage");

  const host = (await headers()).get("host") ?? "on.vtk.be";
  const SHORTLINK_HOST = shortlinkDisplayHost(host);
  const links = await prisma.shortLink.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
  const nl = locale === "nl";
  // Server component: rendered once per request, so reading the clock here is
  // correct (react-hooks/purity targets client components that re-render).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // Serialize to plain rows with dates pre-formatted server-side (stable locale
  // and timezone) so the client component stays free of Date handling.
  const rows: LinkRow[] = links.map((l) => ({
    id: l.id,
    slug: l.slug,
    url: l.url,
    enabled: l.enabled,
    clicks: l.clicks,
    createdByName: l.createdBy?.name ?? null,
    createdAtLabel: dateFmt.format(l.createdAt),
    expiresValue: l.expiresAt ? l.expiresAt.toISOString().slice(0, 10) : "",
    expiresLabel: l.expiresAt ? dateFmt.format(l.expiresAt) : null,
    expired: l.expiresAt != null && l.expiresAt.getTime() <= now,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "Verkorte links" : "Short links"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? `Maak korte URL's aan onder ${SHORTLINK_HOST}/… die doorsturen naar een adres naar keuze.`
            : `Create short URLs under ${SHORTLINK_HOST}/… that redirect to a destination of your choice.`}
        </p>
      </div>

      <ShortLinksManager host={SHORTLINK_HOST} nl={nl} links={rows} />
    </div>
  );
}
