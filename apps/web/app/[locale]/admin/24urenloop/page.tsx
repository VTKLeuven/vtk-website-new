import { notFound } from "next/navigation";
import { Card } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { utcToLocalDateTime } from "@/lib/ticketing/time";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { clearUrenloopStatsAction } from "@/app/actions/urenloop";
import { readUrenloopData } from "@/lib/urenloop/server";
import { UrenloopConfigForm } from "./UrenloopConfigForm";

export default async function AdminUrenloopPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";

  await requirePermission("urenloop.manage");

  const { config, stats } = await readUrenloopData();

  const startsAtLocal = config.startsAt
    ? utcToLocalDateTime(new Date(config.startsAt))
    : "";
  const endsAtLocal = config.endsAt
    ? utcToLocalDateTime(new Date(config.endsAt))
    : "";
  const showResultsUntilLocal = config.showResultsUntil
    ? utcToLocalDateTime(new Date(config.showResultsUntil))
    : "";

  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">
          {nl ? "24 urenloop" : "24-hour run"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? "Eén plek voor het startschot, de aankomst en hoe lang de eindstand na de race op de site blijft staan. Zowel de 24 urenloop-frontpage als het blok [[24urenloop]] op een inhoudspagina lezen deze uren."
            : "One place for the start gun, the finish, and how long final standings stay on the site after the race. Both the 24-hour run front page and the [[24urenloop]] block on a content page read these times."}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {nl ? "Tijdstippen" : "Schedule"}
        </h2>
        <Card className="p-5">
          <UrenloopConfigForm
            locale={locale}
            startsAt={startsAtLocal}
            endsAt={endsAtLocal}
            showResultsUntil={showResultsUntilLocal}
          />
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">
            {nl ? "Live tussenstand van de piste" : "Live standings from the track"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {nl
              ? "De gekoppelde timinglaptop op het sportkot stuurt tijdens de race automatisch het aantal ronden en de top 3 door."
              : "During the race, the paired timing laptop at the track automatically pushes the lap total and top 3 rankings."}
          </p>
        </div>
        <Card className="p-5">
          {stats ? (
            <div className="space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs uppercase text-zinc-500">
                    {nl ? "Status" : "Status"}
                  </dt>
                  <dd className="mt-0.5 font-medium">
                    {stats.payload.final
                      ? nl
                        ? "Eindstand (race afgesloten)"
                        : "Final standings (race closed)"
                      : stats.payload.frozenAt
                        ? nl
                          ? "Bevroren voor het slotuur"
                          : "Frozen for the final hour"
                        : nl
                          ? "Live"
                          : "Live"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-zinc-500">
                    {nl ? "Totaal" : "Total"}
                  </dt>
                  <dd className="mt-0.5 font-medium tabular-nums">
                    {stats.payload.totals.laps}{" "}
                    {nl ? "ronden" : "laps"} ({stats.payload.totals.km.toFixed(1)}{" "}
                    km)
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-zinc-500">
                    {nl ? "Laatst ontvangen" : "Last received"}
                  </dt>
                  <dd className="mt-0.5 text-zinc-700">
                    {dateFmt.format(new Date(stats.receivedAt))}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-zinc-500">
                    {nl ? "Broncomputer" : "Source computer"}
                  </dt>
                  <dd className="mt-0.5 text-zinc-700">
                    {stats.deviceLabel || stats.deviceEmail || "—"}
                  </dd>
                </div>
              </dl>

              <div className="border-t border-vtk-blue/10 pt-4">
                <DeleteButton
                  action={clearUrenloopStatsAction}
                  fields={{}}
                  title={
                    nl
                      ? "Ontvangen tussenstand wissen?"
                      : "Clear received standings?"
                  }
                  description={
                    nl
                      ? "Wist de laatst opgeslagen tussenstand op vtk.be. Als de timinglaptop op de piste nog draait, stuurt die bij de volgende ronde of na enkele minuten opnieuw de actuele stand door."
                      : "Clears the last stored standings on vtk.be. If the timing laptop at the track is still running, it will push the current standings again on the next lap or within a few minutes."
                  }
                  confirmLabel={nl ? "Tussenstand wissen" : "Clear standings"}
                  cancelLabel={nl ? "Annuleren" : "Cancel"}
                  successMessage={
                    nl ? "Tussenstand gewist." : "Standings cleared."
                  }
                >
                  {nl ? "Ontvangen tussenstand wissen" : "Clear received standings"}
                </DeleteButton>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              {nl
                ? "Nog geen tussenstand ontvangen. Zodra de gekoppelde timinglaptop op het VTK-account het eerste rondje telt, verschijnen de cijfers hier en op de site."
                : "No standings received yet. As soon as the paired timing laptop counts the first lap, the figures will appear here and on the site."}
            </p>
          )}
        </Card>
      </section>
    </div>
  );
}
