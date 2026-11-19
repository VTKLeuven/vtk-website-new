import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { getGoogleStatus } from "@/lib/google/config";
import { mailGroupAccess } from "@/lib/google/access";
import { loadCategoryOptions, loadSourceOptions } from "@/lib/google/mailGroupOptions";
import { NewMailGroupForm } from "./NewMailGroupForm";

/**
 * Een nieuw groepsadres, in één formulier: adres, wie erin zit (bronnen en
 * losse leden) en de instellingen. Het stond onderaan het overzicht in een
 * dichtgeklapt blok, en wie het vond, kreeg eerst een lege lijst en moest de
 * leden daarna op de detailpagina toevoegen.
 */
export default async function NewMailGroupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";

  const access = await mailGroupAccess();
  if (!access.manageAll && access.werkgroepIds.size === 0) throw new Error("FORBIDDEN");

  const [status, werkgroepen, sourceOptions, categoryOptions] = await Promise.all([
    getGoogleStatus(),
    prisma.group.findMany({
      where: access.manageAll ? { type: "WERKGROEP", active: true } : { id: { in: [...access.werkgroepIds] } },
      select: { id: true, nameNl: true, nameEn: true, mailPrefix: true },
      orderBy: { nameNl: "asc" },
    }),
    access.manageAll ? loadSourceOptions(nl) : [],
    access.manageAll ? loadCategoryOptions(nl) : [],
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-vtk-ink">{nl ? "Nieuw groepsadres" : "New group address"}</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          {access.manageAll
            ? nl
              ? "Kies het adres, wie erin zit en wie ernaar mag mailen. Bij het aanmaken staat de groep binnen de minuut in Google."
              : "Pick the address, who is in it and who may mail it. Once created, the group is in Google within a minute."
            : nl
              ? "Een adres met het voorvoegsel van je werkgroep. De leden zet je erin op de volgende pagina."
              : "An address with your work group's prefix. You add the members on the next page."}
        </p>
      </div>
      <NewMailGroupForm
        nl={nl}
        domain={status.domain ?? "vtk.be"}
        manageAll={access.manageAll}
        werkgroepen={werkgroepen
          .filter((g) => access.manageAll || g.mailPrefix)
          .map((g) => ({ id: g.id, name: nl ? g.nameNl : g.nameEn, prefix: g.mailPrefix }))}
        sourceOptions={sourceOptions.flatMap((group) => group.options.map((o) => ({ ...o, group: group.label })))}
        categoryOptions={categoryOptions}
      />
    </div>
  );
}
