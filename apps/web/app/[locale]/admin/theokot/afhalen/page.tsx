import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { TheokotAdminNav } from "../TheokotAdminNav";
import { PickupCounter } from "@/components/theokot/PickupCounter";

import "@/app/design/vtk-basic.css";

export default async function TheokotPickupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/theokot/afhalen`);
  const has = (p: string) => session.user.isSuperAdmin || session.permissions.includes(p);
  const caps = { manage: has("theokot.manage"), pickup: has("theokot.pickup") };

  if (!caps.pickup) {
    return <p className="text-sm text-zinc-500">{nl ? "Geen toegang." : "No access."}</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Theokot · {nl ? "Afhaalbalie" : "Pickup counter"}</h1>
        <Link
          href={`${base}/theokot/balie`}
          target="_blank"
          className="rounded-full border border-vtk-blue/15 px-4 py-2 text-sm text-vtk-ink hover:bg-vtk-blue-soft/60"
        >
          {nl ? "Open op aparte pagina ↗" : "Open on separate page ↗"}
        </Link>
      </div>
      <TheokotAdminNav base={base} nl={nl} active="afhalen" caps={caps} />
      <p className="text-sm text-[#5c667f]">
        {nl
          ? "De aparte pagina toont enkel de afhaalbalie (zonder admin-menu) — geef die link aan shifters die enkel broodjes mogen uitdelen."
          : "The separate page shows only the pickup counter (no admin menu) — share it with shifters who may only hand out sandwiches."}
      </p>
      <PickupCounter nl={nl} />
    </div>
  );
}
