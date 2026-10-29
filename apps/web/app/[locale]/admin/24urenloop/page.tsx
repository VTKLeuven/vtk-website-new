import { notFound } from "next/navigation";
import { Card } from "@vtk/ui";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { utcToLocalDateTime } from "@/lib/ticketing/time";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import {
  clearUrenloopStatsAction,
  deleteUrenloopEditionAction,
} from "@/app/actions/urenloop";
import { readUrenloopData } from "@/lib/urenloop/server";
import { listUrenloopEditions } from "@/lib/urenloop/runnerStats";
import { LAPS_CSV_COLUMNS } from "@/lib/urenloop/laps";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { UrenloopLapsUploadForm } from "./UrenloopLapsUploadForm";
import {
  isWithinConfiguredEdition,
  resolvePublicUrenloopState,
} from "@/lib/urenloop/stats";
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

  const [{ config, stats }, activeDevices, allowedEmails, editions] = await Promise.all([
    readUrenloopData(),
    prisma.urenloopDeviceToken.findMany({
      where: { revokedAt: null },
      orderBy: { lastUsedAt: "desc" },
      take: 20,
    }),
    prisma.urenloopDownloadEmail.findMany({
      select: { email: true, canPublishStats: true },
    }),
    listUrenloopEditions(),
  ]);

  const publishByEmail = new Map(
    allowedEmails.map((entry) => [entry.email, entry.canPublishStats]),
  );
  const pairedDevices = activeDevices
    .filter((device) => publishByEmail.has(device.email))
    .map((device) => ({
      ...device,
      canPublishStats: publishByEmail.get(device.email) ?? false,
    }));

  const now = new Date();
  const publicState = resolvePublicUrenloopState(config, stats, now);
  const statsVisibleOnPublicSite =
    publicState?.phase === "live" || publicState?.phase === "final";
  const statsWithinEdition = stats
    ? isWithinConfiguredEdition(stats.payload.eventStart, config, now)
    : false;
  const beforeStartGun =
    config.startsAt !== null && now.getTime() < Date.parse(config.startsAt);

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
            ? "Eén plek voor het startschot, de aankomst en hoe lang de eindstand na de race op de site blijft staan. Het blok [[24urenloop]] op een inhoudspagina leest deze uren."
            : "One place for the start gun, the finish, and how long final standings stay on the site after the race. The [[24urenloop]] block on a content page reads these times."}
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
              ? "Hier zie je of de timinglaptop verbonden is en welke cijfers laatst werden doorgestuurd. Vóór het ingestelde startschot blijft de publieke site op de aftelklok staan, maar kan je hier al testen of alles binnenkomt."
              : "Here you can check whether the timing laptop is connected and inspect the latest figures pushed from the track. Before the scheduled start gun, the public site stays on the countdown while you can already test the connection here."}
          </p>
        </div>

        <Card className="space-y-6 p-5">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {nl ? "Gekoppelde computers" : "Paired computers"}
            </h3>
            {pairedDevices.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {nl
                  ? "Nog geen timinglaptop gekoppeld. Open de 24 urenloop-app op de laptop en kies in het menu 'Updates instellen…' om te koppelen."
                  : "No timing laptop paired yet. Open the 24-hour run desktop app and choose 'Updates instellen…' in the menu to pair."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase text-zinc-500">
                      <th className="py-1.5 pr-4 font-medium">
                        {nl ? "Computer" : "Computer"}
                      </th>
                      <th className="py-1.5 pr-4 font-medium">
                        {nl ? "Account" : "Account"}
                      </th>
                      <th className="py-1.5 pr-4 font-medium">
                        {nl ? "Tussenstand sturen" : "Push standings"}
                      </th>
                      <th className="py-1.5 pr-4 font-medium">
                        {nl ? "App-versie" : "App version"}
                      </th>
                      <th className="py-1.5 font-medium">
                        {nl ? "Laatst gezien" : "Last seen"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pairedDevices.map((device) => (
                      <tr key={device.id} className="border-b border-vtk-blue/5">
                        <td className="py-2 pr-4 font-medium">{device.label}</td>
                        <td className="py-2 pr-4 text-zinc-600">{device.email}</td>
                        <td className="py-2 pr-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              device.canPublishStats
                                ? "bg-vtk-yellow/50 text-vtk-ink"
                                : "border border-zinc-200 text-zinc-500"
                            }`}
                          >
                            {device.canPublishStats
                              ? nl
                                ? "Toegestaan"
                                : "Allowed"
                              : nl
                                ? "Enkel updates (vraag IT)"
                                : "Updates only (ask IT)"}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-zinc-500">
                          {device.appVersion ?? "—"}
                        </td>
                        <td className="py-2 text-zinc-500">
                          {dateFmt.format(device.lastUsedAt ?? device.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-4 border-t border-vtk-blue/10 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {nl ? "Laatst ontvangen tussenstand" : "Latest received standings"}
              </h3>
              {stats ? (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    statsVisibleOnPublicSite
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-vtk-blue-soft text-vtk-ink"
                  }`}
                >
                  {statsVisibleOnPublicSite
                    ? nl
                      ? "Zichtbaar op vtk.be"
                      : "Visible on vtk.be"
                    : beforeStartGun
                      ? nl
                        ? "Enkel zichtbaar in beheer — publieke site toont de aftelklok tot het startschot"
                        : "Visible in admin only — public site shows countdown until start gun"
                      : !statsWithinEdition
                        ? nl
                          ? "Enkel zichtbaar in beheer — testloop buiten het ingestelde startuur"
                          : "Visible in admin only — test run outside scheduled start time"
                        : nl
                          ? "Enkel zichtbaar in beheer"
                          : "Visible in admin only"}
                </span>
              ) : null}
            </div>

            {stats ? (
              <div className="space-y-5">
                <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
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
                      {stats.payload.totals.laps} {nl ? "ronden" : "laps"} (
                      {stats.payload.totals.km.toFixed(1)} km)
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-zinc-500">
                      {nl ? "Start eerste ronde" : "First lap start"}
                    </dt>
                    <dd className="mt-0.5 text-zinc-700">
                      {dateFmt.format(new Date(stats.payload.eventStart))}
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

                <div className="grid gap-4 border-t border-vtk-blue/10 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <h4 className="text-xs font-medium uppercase text-zinc-500">
                      {nl ? "Meeste ronden" : "Most laps"}
                    </h4>
                    {stats.payload.mostLaps.length === 0 ? (
                      <p className="mt-1 text-zinc-400">—</p>
                    ) : (
                      <ol className="mt-1 space-y-0.5">
                        {stats.payload.mostLaps.slice(0, 3).map((r, i) => (
                          <li key={`${r.name}-${i}`} className="flex justify-between gap-2">
                            <span className="truncate">
                              {i + 1}. {r.name}
                            </span>
                            <span className="shrink-0 tabular-nums text-zinc-500">
                              {r.laps}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-medium uppercase text-zinc-500">
                      {nl ? "Snelste ronde" : "Fastest lap"}
                    </h4>
                    {stats.payload.fastestLap.length === 0 ? (
                      <p className="mt-1 text-zinc-400">—</p>
                    ) : (
                      <ol className="mt-1 space-y-0.5">
                        {stats.payload.fastestLap.slice(0, 3).map((r, i) => (
                          <li key={`${r.name}-${i}`} className="flex justify-between gap-2">
                            <span className="truncate">
                              {i + 1}. {r.name}
                            </span>
                            <span className="shrink-0 tabular-nums text-zinc-500">
                              {r.time}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-medium uppercase text-zinc-500">
                      {nl ? "Meeste ronden (1e bach)" : "Most laps (1st year)"}
                    </h4>
                    {stats.payload.firstYearMostLaps.length === 0 ? (
                      <p className="mt-1 text-zinc-400">—</p>
                    ) : (
                      <ol className="mt-1 space-y-0.5">
                        {stats.payload.firstYearMostLaps.slice(0, 3).map((r, i) => (
                          <li key={`${r.name}-${i}`} className="flex justify-between gap-2">
                            <span className="truncate">
                              {i + 1}. {r.name}
                            </span>
                            <span className="shrink-0 tabular-nums text-zinc-500">
                              {r.laps}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-medium uppercase text-zinc-500">
                      {nl ? "Groepen" : "Groups"}
                    </h4>
                    {stats.payload.groups.length === 0 ? (
                      <p className="mt-1 text-zinc-400">—</p>
                    ) : (
                      <ol className="mt-1 space-y-0.5">
                        {stats.payload.groups.slice(0, 3).map((g, i) => (
                          <li key={`${g.name}-${i}`} className="flex justify-between gap-2">
                            <span className="truncate">
                              {i + 1}. {g.name}
                            </span>
                            <span className="shrink-0 tabular-nums text-zinc-500">
                              {g.laps}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>

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
                  ? "Nog geen tussenstand ontvangen. Zodra de gekoppelde timinglaptop op het VTK-account (buiten testmodus) een rondje telt, verschijnen de cijfers hier binnen de minuut."
                  : "No standings received yet. As soon as the paired timing laptop on the VTK account (outside test mode) counts a lap, the figures will appear here within a minute."}
              </p>
            )}
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">
            {nl ? "Rondes per loper" : "Laps per runner"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {nl
              ? "Na de race laad je laps.csv uit de export van de telapp op. Elke loper met een r-nummer ziet dan in zijn account elke ronde met het uur en de tijd, zijn aantal, gemiddelde en snelste ronde. Het r-nummer koppelt de ronde aan het account; namen worden niet bewaard."
              : "After the race, upload laps.csv from the lap-counting app's export. Every runner with an r-number then sees each lap with its time of day and lap time, their count, average and fastest lap in their account. The r-number links a lap to the account; names are not stored."}
          </p>
        </div>
        <Card className="space-y-6 p-5">
          <UrenloopLapsUploadForm locale={locale} />

          {/* Het formaat staat hier en niet enkel in de README van de export:
              raakt die zoek, of komt de export ooit uit een ander programma,
              dan weet Sport nog wat er in het bestand moet staan. */}
          <AdminDisclosure
            variant="row"
            summary={
              <span className="text-sm font-medium text-vtk-ink">
                {nl ? "Wat moet er in laps.csv staan?" : "What goes into laps.csv?"}
              </span>
            }
          >
            <div className="space-y-4 text-sm">
              <ul className="list-disc space-y-1 pl-5 text-zinc-600">
                {(nl
                  ? [
                      "Komma-gescheiden, met de kolomnamen op de eerste regel. De volgorde van de kolommen maakt niet uit.",
                      "Eén regel per gelopen ronde, enkel de race zelf (geen testrondes), en één jaar per bestand.",
                      "Tijden in UTC, ISO 8601 (2026-10-20T18:00:02.809Z). Op de site staan ze daarna in Brusselse tijd.",
                      "Kolommen die hier niet staan, worden genegeerd. Een naam wordt nooit bewaard, ook niet als runner_name erin staat.",
                    ]
                  : [
                      "Comma-separated, with the column names on the first line. Column order does not matter.",
                      "One line per lap run, only the race itself (no test laps), and one year per file.",
                      "Times in UTC, ISO 8601 (2026-10-20T18:00:02.809Z). The site then shows them in Brussels time.",
                      "Columns not listed here are ignored. A name is never stored, not even when runner_name is present.",
                    ]
                ).map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase text-zinc-500">
                      <th className="py-1.5 pr-4 font-medium">{nl ? "Kolom" : "Column"}</th>
                      <th className="py-1.5 pr-4 font-medium">{nl ? "Verplicht" : "Required"}</th>
                      <th className="py-1.5 pr-4 font-medium">{nl ? "Voorbeeld" : "Example"}</th>
                      <th className="py-1.5 font-medium">{nl ? "Betekenis" : "Meaning"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LAPS_CSV_COLUMNS.map((column) => (
                      <tr key={column.name} className="border-b border-vtk-blue/5 align-top">
                        <td className="py-2 pr-4 font-mono text-xs text-vtk-ink">{column.name}</td>
                        <td className="py-2 pr-4 text-zinc-600">
                          {column.required ? (nl ? "ja" : "yes") : nl ? "nee" : "no"}
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs text-zinc-600">{column.example}</td>
                        <td className="py-2 text-zinc-600">{nl ? column.nl : column.en}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {nl ? "Kleinste geldige bestand" : "Smallest valid file"}
                </p>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-vtk-blue-soft/60 p-3 font-mono text-xs text-vtk-ink">
                  {[
                    LAPS_CSV_COLUMNS.filter((c) => c.required).map((c) => c.name).join(","),
                    LAPS_CSV_COLUMNS.filter((c) => c.required).map((c) => c.example).join(","),
                  ].join("\n")}
                </pre>
              </div>
            </div>
          </AdminDisclosure>

          {editions.length > 0 ? (
            <div className="overflow-x-auto border-t border-vtk-blue/10 pt-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase text-zinc-500">
                    <th className="py-1.5 pr-4 font-medium">{nl ? "Jaar" : "Year"}</th>
                    <th className="py-1.5 pr-4 text-right font-medium">{nl ? "Rondes" : "Laps"}</th>
                    <th className="py-1.5 pr-4 text-right font-medium">
                      {nl ? "Lopers met r-nummer" : "Runners with r-number"}
                    </th>
                    <th className="py-1.5 pr-4 text-right font-medium">
                      {nl ? "Waarvan met account" : "Of which with account"}
                    </th>
                    <th className="py-1.5 pr-4 font-medium">{nl ? "Opgeladen" : "Uploaded"}</th>
                    <th className="py-1.5 font-medium">
                      <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {editions.map((edition) => (
                    <tr key={edition.year} className="border-b border-vtk-blue/5">
                      <td className="py-2 pr-4 font-medium">{edition.year}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{edition.laps}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {edition.runnersWithRNumber}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {edition.runnersWithAccount}
                      </td>
                      <td className="py-2 pr-4 text-zinc-500">
                        {dateFmt.format(edition.importedAt)}
                        {edition.importedBy ? `, ${edition.importedBy.name}` : ""}
                      </td>
                      <td className="py-2 text-right">
                        <DeleteIconButton
                          action={deleteUrenloopEditionAction}
                          fields={{ year: String(edition.year) }}
                          label={nl ? "Verwijderen" : "Delete"}
                          srLabel={
                            nl
                              ? `Rondes van ${edition.year} verwijderen`
                              : `Delete laps of ${edition.year}`
                          }
                          title={
                            nl
                              ? `Rondes van ${edition.year} verwijderen?`
                              : `Delete laps of ${edition.year}?`
                          }
                          description={
                            nl
                              ? `De ${edition.laps} rondes van ${edition.year} verdwijnen uit elk account. Andere jaren en de live tussenstand blijven staan. Je kan laps.csv later opnieuw opladen.`
                              : `The ${edition.laps} laps of ${edition.year} disappear from every account. Other years and the live standings stay. You can upload laps.csv again later.`
                          }
                          confirmLabel={nl ? "Verwijderen" : "Delete"}
                          cancelLabel={nl ? "Annuleren" : "Cancel"}
                          successMessage={
                            nl ? `Rondes van ${edition.year} verwijderd.` : `Laps of ${edition.year} deleted.`
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-zinc-500">
                {nl
                  ? "Wie geen account heeft, of een ander r-nummer in zijn profiel, ziet niets. Maakt iemand later een account met dat r-nummer, dan verschijnen zijn rondes vanzelf."
                  : "Runners without an account, or with a different r-number in their profile, see nothing. Anyone who later creates an account with that r-number sees their laps automatically."}
              </p>
            </div>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
