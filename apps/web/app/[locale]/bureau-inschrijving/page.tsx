import type { Metadata } from "next";
import Link from "@/components/ui/Link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { landingQuery } from "@/lib/ticketing/source";
import type { Locale } from "@vtk/i18n";

import "@/app/design/vtk-basic.css";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Vaste link naar de inschrijving van het eerstvolgende VTK Bureau.
 * Stuurt automatisch door naar `/bureau/<slug>` als er een bureau gepland staat.
 */
export default async function BureauRegistrationRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const now = new Date();
  const nextBureau = await prisma.meeting.findFirst({
    where: {
      kind: "BUREAU",
      startsAt: { gte: now },
    },
    orderBy: { startsAt: "asc" },
    select: { slug: true },
  });

  if (nextBureau) {
    // Geef `?via=` en `?c=` door: de vaste link staat in de mail van Onderwijs.
    redirect(`${base}/bureau/${nextBureau.slug}${landingQuery(await searchParams)}`);
  }

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">VTK Bureau</h1>
          <p className="vtk-page-subtitle">
            {nl
              ? "Inschrijven voor het VTK Bureau."
              : "Registration for the VTK Education Board meeting."}
          </p>
        </div>
      </header>

      <div className="vtk-page-shell">
        <div className="vtk-basic-stack">
          <div className="vtk-basic-empty">
            <p>
              {nl
                ? "Er staat momenteel geen volgend VTK Bureau ingepland om voor in te schrijven."
                : "There is currently no upcoming VTK Bureau scheduled for registration."}
            </p>
            <div className="mt-4">
              <Link href={`${base}/`} className="vtk-button vtk-button-primary">
                {nl ? "Terug naar home" : "Back to home"}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
