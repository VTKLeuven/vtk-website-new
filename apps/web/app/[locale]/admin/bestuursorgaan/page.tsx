import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { prisma } from "@vtk/db";
import Link from "@/components/ui/Link";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconAnchor } from "@/components/ui/IconButton";
import { ExternalLinkIcon } from "@/components/ui/icons";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { currentWorkingYear, formatWorkingYear, parseWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { getGoogleStatus } from "@/lib/google/config";
import { toExplorerData } from "@/lib/bo/explorer";
import { loadBoOverview } from "@/lib/bo/overview";
import { getBoConfig, getScanStatus, type BoScanStatus } from "@/lib/bo/settings";
import { deleteBoPostAliasAction } from "@/app/actions/bestuursorgaan";
import { BO_VIEW_SCREEN, parseBoView } from "@/lib/bo/views";
import { BoViews } from "./BoViews";
import { BoSettingsForm, PairBudgetSelect, PostAliasSelect, ScanButton } from "./BoControls";
import { boErrorMessages } from "./messages";

/*
 * /admin/bestuursorgaan: welke budgetten en resultaten er per post langs het
 * BO passeerden, met de bedragen uit de rekenbladen. Gelezen uit de gedeelde
 * drive (`lib/bo/scan.ts`); deze pagina schrijft daar nooit iets in.
 *
 * Bovenaan wat nog een beslissing vraagt, daaronder een van twee weergaven
 * (`BoViews`): de verkenner met drie panelen of de lijst met formulieren. Wie
 * welke verkiest, wordt per account onthouden. Zie docs/design-decisions.md
 * ("Bestuursorgaan: de verkenner").
 */

type SearchParams = { jaar?: string };

function moment(iso: string, nl: boolean): string {
  return new Date(iso).toLocaleString(nl ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Brussels",
  });
}

export default async function BestuursorgaanPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requirePermission("bestuursorgaan.manage");

  const sp = await searchParams;
  const year = parseWorkingYear(sp.jaar);
  const today = new Date();

  const [{ overview, years }, google, config, scan, posts, aliases, viewPreference] = await Promise.all([
    loadBoOverview(year, nl, today),
    getGoogleStatus(),
    getBoConfig(),
    getScanStatus(),
    prisma.group.findMany({
      where: { active: true },
      orderBy: [{ type: "asc" }, { orderInPraesidium: "asc" }, { nameNl: "asc" }],
      select: { id: true, nameNl: true, nameEn: true },
    }),
    prisma.boPostAlias.findMany({ include: { group: { select: { nameNl: true, nameEn: true } } }, orderBy: { label: "asc" } }),
    prisma.userViewPreference.findUnique({
      where: { userId_screen: { userId: session.user.id, screen: BO_VIEW_SCREEN } },
      select: { view: true },
    }),
  ]);
  const errorMessages = boErrorMessages(locale);
  const hasFolder = Boolean(config.rootFolderId || config.yearFolderIds[String(currentWorkingYear())]);
  const ready = google.configured && Boolean(google.driveSubject) && hasFolder;
  const postOptions = posts.map((p) => ({ id: p.id, name: nl ? p.nameNl : p.nameEn }));

  const data = toExplorerData(overview, year, today);
  const tabs = workingYearTabs(years);

  return (
    <div className="space-y-7">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">{nl ? "Bestuursorgaan" : "Board meetings"}</h1>
          <p className="mt-1 max-w-3xl text-sm text-vtk-muted">
            {nl
              ? "Welke budgetten en resultaten er per post langs het BO passeerden, met de bedragen uit de rekenbladen. Gelezen uit de map Bestuursorgaan op de gedeelde drive; wat daar verandert, staat hier binnen het halfuur."
              : "Which budgets and results each post took to the board meeting, with the amounts from the spreadsheets. Read from the Bestuursorgaan folder on the shared drive; changes there show up here within half an hour."}
          </p>
        </div>
        {tabs.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label={nl ? "Werkingsjaar" : "Working year"}>
            {tabs.map((y) => (
              <Link
                key={y}
                href={`${base}/admin/bestuursorgaan?jaar=${y}`}
                aria-current={y === year ? "page" : undefined}
                className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${
                  y === year ? "bg-vtk-blue-soft text-vtk-ink" : "text-vtk-muted hover:text-vtk-ink"
                }`}
              >
                {formatWorkingYear(y)}
              </Link>
            ))}
          </div>
        )}
      </div>

      <ScanLine scan={scan} year={year} ready={ready} nl={nl} locale={locale} errorMessages={errorMessages} />

      {!ready && (
        <SetupNotice
          nl={nl}
          configured={google.configured}
          driveSubject={google.driveSubject}
          hasFolder={hasFolder}
          isSuperAdmin={session.user.isSuperAdmin}
          base={base}
        />
      )}

      <TodoList overview={overview} nl={nl} locale={locale} postOptions={postOptions} errorMessages={errorMessages} driveSubject={google.driveSubject} />

      {data.dossiers.length === 0 && data.meetings.length === 0 ? (
        <p className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated p-5 text-sm text-vtk-muted">
          {nl
            ? `Nog geen budgetten of resultaten gevonden voor ${formatWorkingYear(year)}.`
            : `No budgets or results found for ${formatWorkingYear(year)} yet.`}
        </p>
      ) : (
        <BoViews
          data={data}
          locale={locale}
          errorMessages={errorMessages}
          initialView={parseBoView(viewPreference?.view)}
        />
      )}

      <AdminDisclosure
        defaultOpen={!hasFolder}
        summary={
          <span className="block">
            <span className="block font-semibold text-vtk-ink">{nl ? "Instellingen" : "Settings"}</span>
            <span className="block text-xs text-vtk-muted">
              {nl
                ? `Waar de BO-map staat, en ${aliases.length} ${aliases.length === 1 ? "postnaam" : "postnamen"} die met de hand gekoppeld zijn.`
                : `Where the board folder is, and ${aliases.length} post names linked by hand.`}
            </span>
          </span>
        }
      >
        <div className="grid gap-6">
          <p className="text-sm text-vtk-body">
            {google.driveSubject
              ? nl
                ? `De site leest de map als ${google.driveSubject}. Dat account kiest IT bij Configuratie; het moet lid zijn van de gedeelde drive en de mappen kunnen openen waar de snelkoppelingen naar wijzen.`
                : `The site reads the folder as ${google.driveSubject}. IT chooses that account under Configuration; it must be a member of the shared drive and be able to open the folders the shortcuts point to.`
              : nl
                ? "Er is nog geen Drive-account gekozen; dat doet IT bij Configuratie."
                : "No Drive account has been chosen yet; IT does that under Configuration."}
          </p>
          <BoSettingsForm
            locale={locale}
            year={formatWorkingYear(currentWorkingYear())}
            root={config.rootFolderId ? `https://drive.google.com/drive/folders/${config.rootFolderId}` : ""}
            yearFolder={
              config.yearFolderIds[String(currentWorkingYear())]
                ? `https://drive.google.com/drive/folders/${config.yearFolderIds[String(currentWorkingYear())]}`
                : ""
            }
            errorMessages={errorMessages}
          />
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold text-vtk-ink">{nl ? "Postnamen in de bestanden" : "Post names in the files"}</h3>
            {aliases.length === 0 ? (
              <p className="text-sm text-vtk-muted">
                {nl
                  ? "Nog geen. Een naam die de site niet zelf herkent, verschijnt bovenaan bij Na te kijken."
                  : "None yet. A name the site does not recognise shows up at the top under To review."}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-vtk-blue/10">
                {aliases.map((alias) => (
                  <li key={alias.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-vtk-ink">{alias.label}</span>{" "}
                      <span className="text-vtk-muted">
                        {nl ? "is" : "is"} {nl ? alias.group.nameNl : alias.group.nameEn}
                      </span>
                    </span>
                    <DeleteIconButton
                      action={deleteBoPostAliasAction}
                      fields={{ key: alias.key }}
                      label={nl ? "Koppeling verwijderen" : "Remove link"}
                      srLabel={nl ? `Koppeling verwijderen: ${alias.label}` : `Remove link: ${alias.label}`}
                      title={nl ? `"${alias.label}" loskoppelen?` : `Unlink "${alias.label}"?`}
                      description={
                        nl
                          ? `Bestanden met "${alias.label}" in de naam horen dan niet meer bij ${alias.group.nameNl} en komen terug bij Na te kijken. De bestanden zelf en de andere koppelingen blijven.`
                          : `Files with "${alias.label}" in the name no longer belong to ${alias.group.nameEn} and return to To review. The files themselves and the other links stay.`
                      }
                      confirmLabel={nl ? "Loskoppelen" : "Unlink"}
                      cancelLabel={nl ? "Annuleren" : "Cancel"}
                      successMessage={nl ? "Koppeling verwijderd." : "Link removed."}
                      errorMessages={errorMessages}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </AdminDisclosure>
    </div>
  );
}

/** Wanneer de map voor het laatst gelezen werd, en de knop om het nu te doen. */
function ScanLine({
  scan,
  year,
  ready,
  nl,
  locale,
  errorMessages,
}: {
  scan: BoScanStatus | null;
  year: number;
  ready: boolean;
  nl: boolean;
  locale: Locale;
  errorMessages: Record<string, string>;
}) {
  const yearStatus = scan?.years.find((y) => y.year === year);
  const facts: string[] = [];
  if (scan?.finishedAt) facts.push(nl ? `Laatst gelezen op ${moment(scan.finishedAt, nl)}` : `Last read on ${moment(scan.finishedAt, nl)}`);
  if (yearStatus?.folderName) facts.push(yearStatus.folderName);
  if (scan && yearStatus && !yearStatus.folderId && !scan.error) {
    facts.push(
      nl
        ? `geen map voor ${formatWorkingYear(year)} gevonden`
        : `no folder found for ${formatWorkingYear(year)}`,
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated px-4 py-3">
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-vtk-body">
          {facts.length > 0 ? facts.join(" · ") : nl ? "Nog nooit gelezen." : "Never read yet."}
        </p>
        {scan?.error && (
          <p className="mt-1 text-[var(--danger-ink)]">
            {nl ? "De laatste ronde mislukte: " : "The last round failed: "}
            {scan.error}
          </p>
        )}
        {scan && scan.skippedFolders.length > 0 && (
          <p className="mt-1 text-xs text-vtk-muted">
            {nl ? "Overgeslagen, want geen BO: " : "Skipped, not a meeting: "}
            {scan.skippedFolders.join(", ")}
          </p>
        )}
      </div>
      {ready && <ScanButton locale={locale} errorMessages={errorMessages} />}
    </div>
  );
}

function SetupNotice({
  nl,
  configured,
  driveSubject,
  hasFolder,
  isSuperAdmin,
  base,
}: {
  nl: boolean;
  configured: boolean;
  driveSubject: string | null;
  hasFolder: boolean;
  isSuperAdmin: boolean;
  base: string;
}) {
  const missingIt = !configured || !driveSubject;
  return (
    <p className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated p-4 text-sm text-vtk-body shadow-[inset_3px_0_0_var(--color-vtk-yellow)]">
      {missingIt
        ? nl
          ? "De site kan de BO-map nog niet lezen: IT moet eerst een Drive-account kiezen bij Configuratie (de Google-koppeling)."
          : "The site cannot read the board folder yet: IT first has to choose a Drive account under Configuration (the Google link)."
        : !hasFolder
          ? nl
            ? "Vul onderaan bij Instellingen de link naar de gedeelde drive Praesidium in; de site zoekt daarin zelf de map Bestuursorgaan van dit jaar."
            : "Fill in the link to the shared drive Praesidium under Settings below; the site finds this year's Bestuursorgaan folder in it by itself."
          : null}{" "}
      {missingIt && isSuperAdmin && (
        <Link href={`${base}/admin/it`} className="font-medium underline">
          {nl ? "Naar Configuratie" : "To Configuration"}
        </Link>
      )}
    </p>
  );
}

/** Wat een beslissing vraagt voor het overzicht klopt. Zonder iets verschijnt ze niet. */
function TodoList({
  overview,
  nl,
  locale,
  postOptions,
  errorMessages,
  driveSubject,
}: {
  overview: Awaited<ReturnType<typeof loadBoOverview>>["overview"];
  nl: boolean;
  locale: Locale;
  postOptions: { id: string; name: string }[];
  errorMessages: Record<string, string>;
  driveSubject: string | null;
}) {
  // `wide`: een keuzelijst, die op een telefoon een eigen regel krijgt. Een
  // linkicoon blijft naast de tekst staan.
  const rows: { key: string; title: string; text: string; control: ReactNode; wide?: boolean }[] = [];

  for (const post of overview.unknownPosts) {
    rows.push({
      key: `post-${post.key}`,
      title: nl ? `Welke post is "${post.label}"?` : `Which post is "${post.label}"?`,
      text: nl
        ? `${post.files.length} ${post.files.length === 1 ? "bestand" : "bestanden"}, bv. ${post.files[0]}. Eén keer kiezen geldt ook voor de volgende.`
        : `${post.files.length} files, e.g. ${post.files[0]}. Choosing once also covers the next ones.`,
      control: <PostAliasSelect locale={locale} label={post.label} posts={postOptions} errorMessages={errorMessages} />,
      wide: true,
    });
  }
  for (const item of overview.pairable) {
    rows.push({
      key: `pair-${item.result.id}`,
      title: nl
        ? `Bij welk budget hoort het resultaat "${item.activity}"?`
        : `Which budget does the result "${item.activity}" belong to?`,
      text: nl
        ? `${item.postName}, ${item.result.meetingLabel}. De naam lijkt op geen enkel budget van die post.`
        : `${item.postName}, ${item.result.meetingLabel}. The name matches no budget of that post.`,
      control: (
        <PairBudgetSelect locale={locale} resultId={item.result.id} candidates={item.candidates} errorMessages={errorMessages} />
      ),
      wide: true,
    });
  }
  for (const doc of overview.unclassified) {
    rows.push({
      key: `doc-${doc.id}`,
      title: nl ? `Is "${doc.name}" een budget of een resultaat?` : `Is "${doc.name}" a budget or a result?`,
      text: nl
        ? `${doc.meetingLabel}. De naam zegt het niet en het staat niet in Budgetten of Resultaten; zet het woord Budget of Resultaat en de post in de naam.`
        : `${doc.meetingLabel}. The name does not say and it is not in Budgetten or Resultaten; put the word Budget or Resultaat and the post in the name.`,
      control: <DriveLink href={doc.webUrl} name={doc.name} nl={nl} />,
    });
  }
  for (const doc of overview.unreachable) {
    rows.push({
      key: `access-${doc.id}`,
      title: nl ? `De site kan "${doc.name}" niet openen` : `The site cannot open "${doc.name}"`,
      text: nl
        ? `${doc.meetingLabel}. Deel het bestand of de map erboven met ${driveSubject ?? "het Drive-account"}, dan staan de bedragen er bij de volgende ronde.`
        : `${doc.meetingLabel}. Share the file or the folder above it with ${driveSubject ?? "the Drive account"}; the amounts appear on the next round.`,
      control: <DriveLink href={doc.webUrl} name={doc.name} nl={nl} />,
    });
  }

  if (rows.length === 0) return null;
  return (
    <section aria-label={nl ? "Na te kijken" : "To review"} className="space-y-2">
      <h2 className="text-lg font-semibold">{nl ? "Na te kijken" : "To review"}</h2>
      <ul className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
        {rows.map((row, index) => (
          <li
            key={row.key}
            className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${index > 0 ? "border-t border-[var(--rule-soft)]" : ""}`}
          >
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-vtk-yellow-dark" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-semibold text-vtk-ink">{row.title}</span>
              <span className="block break-words text-xs text-vtk-muted">{row.text}</span>
            </span>
            {row.wide ? <span className="w-full sm:w-64 sm:shrink-0">{row.control}</span> : row.control}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DriveLink({ href, name, nl }: { href: string; name: string; nl: boolean }) {
  return (
    <IconAnchor
      href={href}
      target="_blank"
      rel="noreferrer"
      label={nl ? "Openen in Drive" : "Open in Drive"}
      srLabel={nl ? `Openen in Drive: ${name}` : `Open in Drive: ${name}`}
    >
      <ExternalLinkIcon />
    </IconAnchor>
  );
}
