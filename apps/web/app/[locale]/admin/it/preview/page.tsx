import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { AuthorizationPreviewPanel } from "@/components/admin/AuthorizationPreviewPanel";

// Superadmin-only, net als de rest van de IT-groep. Deze pagina stond eerst
// bovenaan /admin/it, maar ze lijst elke rol en elke post op: dat duwde de
// eigenlijke configuratie ver onder de vouw. Ze staat nu apart.
export default async function AdminAuthorizationPreview({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();

  const session = await requireSession();
  if (!session.user.isSuperAdmin) notFound();

  const [roles, groups] = await Promise.all([
    prisma.role.findMany({
      orderBy: [{ order: "asc" }, { nameNl: "asc" }],
      select: {
        id: true,
        code: true,
        nameNl: true,
        nameEn: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
    }),
    prisma.group.findMany({
      where: { active: true },
      orderBy: [{ type: "asc" }, { orderInPraesidium: "asc" }, { nameNl: "asc" }],
      select: {
        id: true,
        nameNl: true,
        nameEn: true,
        type: true,
        roleGrants: {
          select: { kind: true, role: { select: { nameNl: true, nameEn: true } } },
        },
      },
    }),
  ]);

  return (
    <AuthorizationPreviewPanel
      locale={localeParam === "en" ? "en" : "nl"}
      roles={roles}
      groups={groups}
    />
  );
}
