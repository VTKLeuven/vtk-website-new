import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { canSeeMailGroups, mailGroupAccess } from "@/lib/google/access";
import { GoogleAdminTabs } from "./GoogleAdminTabs";

/**
 * Google Admin: de groepsadressen, de @vtk.be-accounts en hun
 * organisatie-eenheden, als tabbladen onder één kop zoals Media en Tickets.
 *
 * Dit waren losse pagina's met een rij links boven het overzicht en een
 * "Terug naar groepsadressen" op elke pagina; zie docs/design-decisions.md.
 * Wat iemand niet mag, staat er niet als tabblad: elke pagina toetst haar recht
 * nog zelf.
 */
export default async function GoogleAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";

  const access = await mailGroupAccess();
  if (!canSeeMailGroups(access)) throw new Error("FORBIDDEN");
  const pendingRequests = access.approveAccounts
    ? await prisma.werkgroepAccount.count({ where: { status: "REQUESTED" } })
    : 0;

  return (
    <div className="space-y-6">
      <header className="space-y-3 border-b border-vtk-blue/10">
        <h1 className="text-2xl font-semibold text-vtk-ink">Google Admin</h1>
        <GoogleAdminTabs
          nl={nl}
          manageAll={access.manageAll}
          approveAccounts={access.approveAccounts}
          canRequestAccounts={access.werkgroepIds.size > 0}
          pendingRequests={pendingRequests}
        />
      </header>
      {children}
    </div>
  );
}
