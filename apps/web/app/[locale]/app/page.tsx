import type { Metadata } from "next";
import Image from "next/image";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { buildMetadata } from "@/lib/seo";
import { getAppLinks, platformFromUserAgent } from "@/lib/appLinks";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  const nl = locale === "nl";
  return buildMetadata({
    title: nl ? "De VTK-app" : "The VTK app",
    description: nl
      ? "Download de VTK-app voor iPhone en Android: je lessen, evenementen en tickets, broodjes en meer."
      : "Download the VTK app for iPhone and Android: your classes, events and tickets, sandwiches and more.",
    path: "/app",
    locale,
  });
}

/**
 * `vtk.be/app`: het adres achter de QR-code op de affiches.
 *
 * Een iPhone gaat meteen naar de App Store, een Android-toestel naar Google Play
 * (de links staan onder Admin › Website › App). Al de rest, en een toestel waarvoor
 * nog geen link ingesteld is, krijgt deze pagina met de knoppen die er zijn.
 * `?toon=1` toont de pagina altijd, voor de voorvertoning in de admin.
 */
export default async function AppPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ toon?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const links = await getAppLinks();
  const show = (await searchParams).toon === "1";

  if (!show) {
    const platform = platformFromUserAgent((await headers()).get("user-agent") ?? "");
    if (platform === "ios" && links.ios) redirect(links.ios);
    if (platform === "android" && links.android) redirect(links.android);
  }

  return (
    <div className="vtk-design">
      <section className="mx-auto flex max-w-xl flex-col items-center gap-6 px-5 py-16 text-center">
        <Image src="/app-icon.png" alt="" width={96} height={96} className="rounded-[22px] shadow-lg" priority />
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">{nl ? "De VTK-app is er!" : "The VTK app is here!"}</h1>
          <p className="text-lg text-[color:var(--body)]">
            {nl
              ? "Je lessenrooster, onze evenementen en tickets, broodjes bestellen, Alma-maaltijden checken en meer."
              : "Your timetable, our events and tickets, ordering sandwiches, checking Alma meals and more."}
          </p>
        </div>
        {links.ios || links.android ? (
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
            {links.ios ? (
              <a
                href={links.ios}
                className="rounded-full bg-[color:var(--ink)] px-6 py-3 font-semibold text-[color:var(--paper)]"
              >
                {nl ? "Download in de App Store" : "Download on the App Store"}
              </a>
            ) : null}
            {links.android ? (
              <a
                href={links.android}
                className="rounded-full bg-[color:var(--ink)] px-6 py-3 font-semibold text-[color:var(--paper)]"
              >
                {nl ? "Download in Google Play" : "Get it on Google Play"}
              </a>
            ) : null}
          </div>
        ) : (
          <p className="text-[color:var(--muted)]">
            {nl ? "De app staat binnenkort in de App Store en Google Play." : "The app will be on the App Store and Google Play soon."}
          </p>
        )}
      </section>
    </div>
  );
}
