import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { currentWorkingYear } from "@vtk/auth";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { parseWorkingYear } from "@/lib/workingYear";
import { PocMailCard } from "../PocMailCard";
import { PocYearTabs } from "../PocYearTabs";

/** Tabblad Groepsadressen: het adres per POC, en of het de vertegenwoordigers van een jaar volgt. */
export default async function AdminPocsMail({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale } = await params;
  const { jaar } = await searchParams;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requirePermission("pocs.manage");
  const year = parseWorkingYear(jaar);

  const [pocs, pocLists] = await Promise.all([
    prisma.poc.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        nameNl: true,
        nameEn: true,
        email: true,
        mailYear: true,
        _count: { select: { representatives: { where: { year } } } },
      },
    }),
    // Welke POC een groepsadres heeft dat haar vertegenwoordigers volgt.
    prisma.mailGroupSource.findMany({
      where: { pocId: { not: null } },
      select: { pocId: true, mailGroupId: true, mailGroup: { select: { email: true } } },
    }),
  ]);
  const listByPoc = new Map(pocLists.map((s) => [s.pocId as string, { id: s.mailGroupId, email: s.mailGroup.email }]));

  return (
    <div className="space-y-5">
      <PocYearTabs year={year} href={(y) => `${base}/admin/pocs/mail?jaar=${y}`} />
      <PocMailCard
        nl={nl}
        year={year}
        canCreateLists={session.user.isSuperAdmin || session.permissions.includes("mailgroups.manage")}
        groupsBase={`${base}/admin/groepsadressen`}
        rows={pocs.map((poc) => ({
          id: poc.id,
          name: nl ? poc.nameNl : (poc.nameEn ?? poc.nameNl),
          email: poc.email,
          mailYear: poc.mailYear ?? currentWorkingYear(),
          repsInYear: poc._count.representatives,
          linkedList: listByPoc.get(poc.id) ?? null,
        }))}
      />
    </div>
  );
}
