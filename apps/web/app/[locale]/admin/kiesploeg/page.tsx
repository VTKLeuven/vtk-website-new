import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getGoogleStatus } from "@/lib/google/config";
import { renderAddress } from "@/lib/google/addresses";
import { KiesploegAdmin, type KiesploegRow } from "./KiesploegAdmin";

/**
 * Kiesploegbeheer: de opkomende ploeg met haar eigen posten, haar eigen
 * adressen en haar beperkte accounts.
 *
 * Zie docs/design-decisions.md, "De kiesploeg is een aparte structuur". Kort:
 * dit zijn niet de praesidiumposten, de ploeg bestaat maanden vóór haar
 * werkingsjaar, en haar leden worden op 15 juli vanzelf volwaardig.
 */
export default async function AdminKiesploeg({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("kiesploeg.manage");

  const [kiesploegen, status] = await Promise.all([
    prisma.kiesploeg.findMany({
      orderBy: { workingYear: "desc" },
      select: {
        id: true,
        code: true,
        workingYear: true,
        formalName: true,
        informalName: true,
        active: true,
        accountTemplate: true,
        aliasTemplate: true,
        listTemplate: true,
        posts: {
          orderBy: { order: "asc" },
          select: { id: true, code: true, name: true, isG5: true },
        },
        members: {
          orderBy: { user: { name: "asc" } },
          select: {
            id: true,
            postId: true,
            role: true,
            mailboxActive: true,
            forwardTo: true,
            user: {
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                googleEmail: true,
                googleAccountState: true,
              },
            },
          },
        },
      },
    }),
    getGoogleStatus(),
  ]);

  const domain = status.domain ?? "vtk.be";

  const rows: KiesploegRow[] = kiesploegen.map((k) => ({
    id: k.id,
    code: k.code,
    workingYear: k.workingYear,
    formalName: k.formalName,
    informalName: k.informalName,
    accountTemplate: k.accountTemplate,
    aliasTemplate: k.aliasTemplate,
    listTemplate: k.listTemplate,
    active: k.active,
    /** Nog niet aangetreden of net aangetreden: dan staat het blok open. */
    current: k.workingYear >= currentWorkingYear(),
    posts: k.posts.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      isG5: p.isG5,
      // Het adres dat de knop "standaardlijsten aanmaken" zou opleveren, zodat
      // je de sjabloonvorm ziet voor je hem gebruikt.
      listEmail: renderAddress(k.listTemplate, { code: k.code, post: p.code }, domain),
    })),
    members: k.members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      postId: m.postId,
      role: m.role,
      mailboxActive: m.mailboxActive,
      forwardTo: m.forwardTo,
      googleEmail: m.user.googleEmail,
      accountState: m.user.googleAccountState,
      // Voorbeeld van de alias; het echte adres wordt pas bij het aanmaken
      // vastgelegd (en kan een cijfer krijgen bij naamgenoten).
      aliasPreview:
        m.user.firstName && m.user.lastName
          ? renderAddress(
              k.aliasTemplate,
              { code: k.code, voornaam: m.user.firstName, achternaam: m.user.lastName },
              domain,
            )
          : null,
    })),
  }));

  return (
    <KiesploegAdmin
      nl={nl}
      rows={rows}
      domain={domain}
      configured={status.configured}
      nextWorkingYear={currentWorkingYear() + 1}
      accountsHref={`${nl ? "" : "/en"}/admin/groepsadressen/accounts`}
    />
  );
}
