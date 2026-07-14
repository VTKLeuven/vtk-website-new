import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { SentryTest } from "./SentryTest";

export default async function AdminIT({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;

  // IT-tab is superadmin-only (net als in de admin-nav-filter).
  const session = await requireSession();
  if (!session.user.isSuperAdmin) notFound();

  const nl = locale === "nl";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">IT</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? "Technische hulpmiddelen voor beheerders. Gebruik de knoppen om te controleren of Sentry (foutmonitoring) events ontvangt."
            : "Technical tools for administrators. Use the buttons to verify that Sentry (error monitoring) is receiving events."}
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{nl ? "Sentry testen" : "Test Sentry"}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {nl
              ? "Verstuurt een test-fout naar Sentry. Controleer daarna het Issues-dashboard in Sentry — het event verschijnt normaal binnen ~30 seconden."
              : "Sends a test error to Sentry. Then check the Issues dashboard in Sentry — the event usually appears within ~30 seconds."}
          </p>
        </div>
        <SentryTest nl={nl} />
      </section>
    </div>
  );
}
