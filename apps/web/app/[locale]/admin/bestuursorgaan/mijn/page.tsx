import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { hasPermission } from "@vtk/auth";
import Link from "@/components/ui/Link";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import { loadOwnBo } from "@/lib/bo/overview";
import { BoOwn } from "../BoOwn";

/*
 * /admin/bestuursorgaan/mijn ("Mijn budgetten"): wat de eigen post langs het
 * BO bracht, en welke resultaten nog moeten komen. Elk lid van een post of
 * werkgroep ziet dit voor zijn eigen posten, zonder apart recht; het volledige
 * overzicht van alle posten blijft voor Groep 5. Zie `lib/bo/own.ts`.
 */

export default async function MijnBudgettenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const session = await requireSession(`${base}/inloggen?next=${base}/admin/bestuursorgaan/mijn`);
  const canManage = hasPermission(session, "bestuursorgaan.manage");
  const posts = await loadOwnBo(session.groups, nl);
  const year = formatWorkingYear(currentWorkingYear());

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{nl ? "Mijn budgetten" : "My budgets"}</h1>
          <p className="mt-1 max-w-3xl text-sm text-vtk-muted">
            {nl
              ? "De budgetten en resultaten van je post die dit werkingsjaar langs het BO passeerden, gelezen uit de map Bestuursorgaan op de gedeelde drive. Een resultaat staat open vanaf de BO waarop het budget passeerde. Breng het naar een volgende BO zoals een budget: het rekenblad met Resultaat in de naam "
              : "The budgets and results of your post that passed the board meeting this working year, read from the Bestuursorgaan folder on the shared drive. A result is open from the meeting at which its budget passed. Bring it to a next meeting the way you brought the budget: the spreadsheet with Resultaat in its name "}
            {/* Een bestandsnaam breekt niet af op het streepje van "26-27". */}
            <span className="whitespace-nowrap">
              ({year}_Resultaat_&lt;post&gt;_&lt;{nl ? "activiteit" : "activity"}&gt;)
            </span>
            {nl
              ? " in de map Resultaten van die BO. Wat daar verandert, staat hier binnen het halfuur."
              : " in that meeting's Resultaten folder. Changes there show up here within half an hour."}
          </p>
        </div>
        {canManage && (
          <Link
            href={`${base}/admin/bestuursorgaan`}
            className="inline-flex h-10 items-center justify-center rounded-full border border-vtk-blue/20 px-4 text-sm font-medium text-vtk-ink hover:bg-vtk-blue-soft"
          >
            {nl ? "Alle posten" : "All posts"}
          </Link>
        )}
      </header>

      {posts.length === 0 ? (
        <p className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated p-5 text-sm text-vtk-muted">
          {nl
            ? "Je zit dit werkingsjaar in geen post of werkgroep, dus er zijn geen budgetten om te tonen."
            : "You are not in a post or working group this working year, so there are no budgets to show."}
        </p>
      ) : (
        <BoOwn posts={posts} locale={locale} />
      )}
    </div>
  );
}
