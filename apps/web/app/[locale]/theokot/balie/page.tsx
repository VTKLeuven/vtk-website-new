import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { PleaseLogin } from "@/components/site/pleaseLogin";
import { PickupCounter } from "@/components/theokot/PickupCounter";

import "@/app/design/vtk-basic.css";

/**
 * Losstaande afhaalbalie buiten het admin-paneel, zodat shifters met enkel
 * `theokot.pickup` broodjes kunnen uitdelen zonder toegang tot de rest van admin.
 */
export default async function TheokotBaliePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  let session;
  try {
    session = await requireSession();
  } catch {
    return <PleaseLogin locale={locale} nextPath={`${base}/theokot/balie`} className="vtk-page-shell" />;
  }

  const has = (p: string) => session.user.isSuperAdmin || session.permissions.includes(p);
  if (!has("theokot.pickup")) {
    return (
      <div className="vtk-page">
        <div className="vtk-page-shell">
          <p className="text-sm text-[#5c667f]">
            {nl ? "Je hebt geen toegang tot de afhaalbalie." : "You don't have access to the pickup counter."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · Theokot</div>
          <h1 className="vtk-page-title">{nl ? "Afhaalbalie" : "Pickup counter"}</h1>
        </div>
      </header>
      <div className="vtk-page-shell">
        <PickupCounter nl={nl} />
      </div>
    </div>
  );
}
