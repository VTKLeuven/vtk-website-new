import { notFound } from 'next/navigation';
import type { Locale } from '@vtk/i18n';
import { prisma } from '@vtk/db';
import { hasPermission } from '@vtk/auth';
import Link from '@/components/ui/Link';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { currentWorkingYear, formatWorkingYear } from '@/lib/workingYear';
import { loadBoOverview } from '@/lib/bo/overview';
import { toExplorerData, type XDoc, type XDossier } from '@/lib/bo/explorer';
import { ownPostKeys } from '@/lib/bo/own';
import { getBudgetSettings, listFolderBudgets, postNames, siteBudgetPostKeys } from '@/lib/bo/budget/server';
import { AdminDisclosure } from '@/components/admin/AdminDisclosure';
import { BudgetUpload, DriveImportButton } from '@/components/bo-budget/BudgetImport';
import { money, shortDate } from '@/components/bo-budget/format';
import { RestoreFileButton } from '../BoControls';
import { boErrorMessages } from '../messages';

/*
 * /admin/bestuursorgaan/mappen ("Bestuursorgaan" in de zijbalk): per BO een map, zoals in Drive. Wie een budget
 * of resultaat zoekt, weet meestal op welke BO het passeerde, en zoekt dan
 * dáár, niet per post of per stand.
 *
 * In een map staan de rekenbladen uit de BO-map in Drive (gelezen door de
 * scan, de site schrijft daar niets) én de budgetten die op de site opgesteld
 * zijn voor die BO. Groep 5 ziet alles; een post ziet enkel wat van haar is,
 * en van de site enkel iets als ze meedoet aan de proef (`siteBudgetPostKeys`).
 * Een activiteit die in Drive én op de site staat, is één rij met twee links.
 * Dat wordt hier op de server gefilterd: de pagina krijgt nooit het hele jaar
 * mee voor wie het niet mag zien (zie `lib/bo/own.ts`).
 *
 * Een bestand dat Groep 5 met "Niet meetellen" wegzette, staat nergens in het
 * overzicht, maar wel nog in de map in Drive. Zonder spoor hier leek het dan
 * alsof de scan het niet herkende, ook voor wie het zelf wegzette. Daarom
 * toont een map het onder "Telt niet mee", met een knop om het terug te zetten.
 */

type HiddenRow = {
  id: string;
  /** Zoals het in de BO-map staat: de snelkoppeling, anders het blad. */
  name: string;
  /** De naam van het blad zelf, wanneer die anders is dan de snelkoppeling. */
  sheetName: string | null;
  webUrl: string;
  hiddenAt: Date | null;
};

type FileRow = {
  key: string;
  name: string;
  post: string;
  kind: 'budget' | 'result';
  cents: number | null;
  href: string;
  external: boolean;
  /** `both`: het rekenblad uit Drive is ook op de site gezet. */
  source: 'drive' | 'site' | 'both';
  /** Het blad in Drive, wanneer de rij zelf naar de site leidt. */
  driveHref?: string;
  note?: string;
};

type Folder = {
  id: string;
  label: string;
  date: string | null;
  upcoming: boolean;
  driveUrl: string | null;
  files: FileRow[];
  /** Wat in deze BO-map staat maar niet meetelt; enkel voor Groep 5. */
  hidden: HiddenRow[];
};

function FolderIcon({ open = false }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      aria-hidden="true"
      className="vtk-fold-icon"
      data-open={open ? '1' : undefined}
    >
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" />
    </svg>
  );
}

function FileIcon({ source }: { source: 'drive' | 'site' | 'both' }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="vtk-fold-file" data-source={source}>
      <path d="M6 3h8l5 5v11.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3Z" />
      <path d="M8 12h8M8 15h8M8 18h5" />
    </svg>
  );
}

export default async function BoFoldersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ map?: string; q?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';
  const here = `${base}/admin/bestuursorgaan/mappen`;
  const session = await requireSession(`${base}/inloggen?next=${here}`);
  const all = hasPermission(session, 'bestuursorgaan.manage');
  const ownKeys = ownPostKeys(session.groups);
  const { map: openId, q: query = '' } = await searchParams;

  const year = currentWorkingYear();
  const [{ overview }, settings, hiddenDocs] = await Promise.all([
    loadBoOverview(year, nl),
    getBudgetSettings(),
    all
      ? prisma.boDocument.findMany({
          where: { hiddenAt: { not: null }, missingSince: null, meeting: { workingYear: year } },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, linkName: true, webUrl: true, meetingId: true, hiddenAt: true },
        })
      : [],
  ]);
  const hiddenByMeeting = new Map<string, HiddenRow[]>();
  for (const doc of hiddenDocs) {
    const name = doc.linkName ?? doc.name;
    hiddenByMeeting.set(doc.meetingId, [
      ...(hiddenByMeeting.get(doc.meetingId) ?? []),
      { id: doc.id, name, sheetName: name === doc.name ? null : doc.name, webUrl: doc.webUrl, hiddenAt: doc.hiddenAt },
    ]);
  }
  const data = toExplorerData(overview, year, new Date());
  const siteBudgets = await listFolderBudgets(all ? 'all' : siteBudgetPostKeys(session, settings), settings);
  const names = await postNames([...new Set(siteBudgets.map((b) => b.postKey))], nl);
  const siteHref = (id: string) => `${base}/admin/bestuursorgaan/mijn/${id}`;
  // Een budget op de site hoort bij het blad van dezelfde post en dezelfde activiteit.
  const siteKey = (postKey: string, title: string) => `${postKey}|${title.trim().toLowerCase()}`;
  const siteByKey = new Map(siteBudgets.map((b) => [siteKey(b.postKey, b.title), b]));
  const matched = new Set<string>();

  // Enkel wat deze bezoeker mag zien: alles voor Groep 5, anders de eigen posten.
  const visible = (d: XDossier) => all || d.postKeys.some((k) => ownKeys.includes(k));
  const byMeeting = new Map<string, FileRow[]>();
  const push = (id: string, row: FileRow) => byMeeting.set(id, [...(byMeeting.get(id) ?? []), row]);
  for (const dossier of data.dossiers.filter(visible)) {
    const site = dossier.postKeys.map((k) => siteByKey.get(siteKey(k, dossier.activity))).find(Boolean);
    if (site) matched.add(site.id);
    const add = (doc: XDoc, kind: 'budget' | 'result') =>
      push(doc.meetingId, {
        key: `${doc.id}-${kind}`,
        name: dossier.activity,
        post: dossier.postName,
        kind,
        cents: doc.totalCents,
        href: site ? siteHref(site.id) : doc.webUrl,
        external: !site,
        source: site ? 'both' : 'drive',
        driveHref: site ? doc.webUrl : undefined,
        note: doc.name,
      });
    dossier.budgets.forEach((doc) => add(doc, 'budget'));
    dossier.results.forEach((doc) => add(doc, 'result'));
  }

  const folders: Folder[] = data.meetings
    .filter((m) => all || byMeeting.has(m.id))
    .map((m) => ({
      id: m.id,
      label: m.label,
      date: m.date,
      upcoming: m.upcoming,
      driveUrl: all ? m.webUrl : null,
      files: byMeeting.get(m.id) ?? [],
      hidden: hiddenByMeeting.get(m.id) ?? [],
    }));
  // Budgetten op de site: in de map van de BO waarvoor ze zijn, anders een eigen map.
  const loose: FileRow[] = [];
  for (const b of siteBudgets) {
    // Staat al bij haar blad uit Drive: geen tweede rij.
    if (matched.has(b.id)) continue;
    const row: FileRow = {
      key: `site-${b.id}`,
      name: b.title,
      post: names.get(b.postKey) ?? b.postKey,
      kind: b.hasResult ? 'result' : 'budget',
      cents: b.hasResult ? b.resultCents : b.totalCents,
      href: siteHref(b.id),
      external: false,
      source: 'site',
      note: b.status === 'SUBMITTED' ? (nl ? 'ingediend' : 'submitted') : nl ? 'in opmaak' : 'draft',
    };
    const folder = b.targetDate ? folders.find((f) => f.date === b.targetDate) : null;
    if (folder) folder.files.push(row);
    else if (b.targetDate) {
      let dated = folders.find((f) => f.id === `d-${b.targetDate}`);
      if (!dated) {
        dated = {
          id: `d-${b.targetDate}`,
          label: nl ? `BO van ${shortDate(b.targetDate, nl)}` : `Meeting of ${shortDate(b.targetDate, nl)}`,
          date: b.targetDate,
          upcoming: b.targetDate > data.today,
          driveUrl: null,
          files: [],
          hidden: [],
        };
        folders.push(dated);
      }
      dated.files.push(row);
    } else loose.push(row);
  }
  folders.sort((a, b) => (b.date ?? '0').localeCompare(a.date ?? '0'));
  if (loose.length > 0)
    folders.unshift({
      id: 'geen-bo',
      label: nl ? 'Nog geen BO gekozen' : 'No meeting chosen yet',
      date: null,
      upcoming: false,
      driveUrl: null,
      files: loose,
      hidden: [],
    });

  const open = openId ? (folders.find((f) => f.id === openId) ?? null) : null;
  const needle = query.trim().toLowerCase();
  const hits = needle
    ? folders.flatMap((f) =>
        f.files
          .filter((x) => `${x.name} ${x.post} ${x.note ?? ''}`.toLowerCase().includes(needle))
          .map((x) => ({ folder: f, file: x }))
      )
    : [];

  const errorMessages = boErrorMessages(locale);
  const hiddenOn = (date: Date) =>
    date.toLocaleDateString(nl ? 'nl-BE' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Brussels' });

  const fileTable = (rows: { file: FileRow; folder?: Folder }[]) => (
    <div className="vtk-fold-list">
      <table>
        <thead>
          <tr>
            <th>{nl ? 'Naam' : 'Name'}</th>
            <th>{nl ? 'Post' : 'Post'}</th>
            {rows.some((r) => r.folder) && <th>BO</th>}
            <th className="num">{nl ? 'Totaal' : 'Total'}</th>
            <th>{nl ? 'Staat in' : 'Lives in'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ file, folder }) => (
            <tr key={`${folder?.id ?? ''}${file.key}`}>
              <td>
                <a
                  href={file.href}
                  className="vtk-fold-name"
                  {...(file.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                >
                  <FileIcon source={file.source} />
                  <span>
                    {file.name}
                    {file.note && <small>{file.note}</small>}
                  </span>
                </a>
              </td>
              <td data-label={nl ? 'Post' : 'Post'}>{file.post}</td>
              {rows.some((r) => r.folder) && (
                <td data-label="BO">
                  {folder && <Link href={`${here}?map=${encodeURIComponent(folder.id)}`}>{folder.label}</Link>}
                </td>
              )}
              <td className="num" data-label={nl ? 'Totaal' : 'Total'}>
                {file.cents == null ? '–' : `€ ${money(file.cents / 100, nl)}`}
              </td>
              <td data-label={nl ? 'Staat in' : 'Lives in'}>
                <span className="vtk-fold-where">
                  {file.source !== 'drive' && (
                    <span className="vtk-bo-pill" data-tone="ok">
                      Site
                    </span>
                  )}
                  {file.source === 'drive' && <span className="vtk-bo-pill">Drive</span>}
                  {file.driveHref && (
                    <a href={file.driveHref} target="_blank" rel="noreferrer">
                      {nl ? 'blad in Drive ↗' : 'sheet in Drive ↗'}
                    </a>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="vtk-fold space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <nav className="vtk-fold-crumbs" aria-label={nl ? 'Kruimelpad' : 'Breadcrumb'}>
            {open || needle ? <Link href={here}>{nl ? 'Bestuursorgaan' : 'Board meetings'}</Link> : null}
            {open && <span aria-hidden="true">›</span>}
          </nav>
          <h2 className="text-lg font-semibold">
            {open
              ? open.label
              : needle
                ? nl
                  ? `Zoeken: "${query.trim()}"`
                  : `Search: "${query.trim()}"`
                : nl
                  ? 'Bestuursorgaan'
                  : 'Board meetings'}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-vtk-muted">
            {open
              ? open.date
                ? shortDate(open.date, nl) + (open.upcoming ? (nl ? ' · moet nog komen' : ' · upcoming') : '')
                : nl
                  ? 'Budgetten op de site waarvoor nog geen BO gekozen is.'
                  : 'Budgets on the site without a chosen meeting.'
              : nl
                ? `Elke BO van ${formatWorkingYear(year)} als een map, met de budgetten en resultaten die er passeerden${all ? '' : ' van je eigen post'}: de rekenbladen uit Drive en wat op de site opgesteld is.`
                : `Every board meeting of ${formatWorkingYear(year)} as a folder, with the budgets and results that passed${all ? '' : ' of your own post'}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action={here} method="get" className="vtk-fold-search" role="search">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder={nl ? 'Zoek een activiteit of post' : 'Search an activity or post'}
              aria-label={nl ? 'Zoek in alle mappen' : 'Search all folders'}
            />
          </form>
          {/* BTW per post, vaste prijzen, de proef en de begroting: alles over budgetten op de site. */}
          {all && (
            <Link
              href={`${base}/admin/bestuursorgaan/instellingen`}
              className="inline-flex h-10 items-center justify-center rounded-full border border-vtk-blue/20 px-4 text-sm font-medium text-vtk-ink hover:bg-vtk-blue-soft"
            >
              {nl ? 'Instellingen' : 'Settings'}
            </Link>
          )}
        </div>
      </header>

      {needle ? (
        hits.length === 0 ? (
          <p className="vtk-fold-empty">{nl ? 'Niets gevonden in de mappen.' : 'Nothing found in the folders.'}</p>
        ) : (
          fileTable(hits)
        )
      ) : open ? (
        <>
          {open.driveUrl && (
            <div className="flex flex-wrap items-center gap-3">
              <a href={open.driveUrl} target="_blank" rel="noreferrer" className="vtk-fold-drive">
                {nl ? 'Deze map openen in Drive ↗' : 'Open this folder in Drive ↗'}
              </a>
              {open.files.some((f) => f.source === 'drive') && (
                <DriveImportButton
                  meetingId={open.id}
                  label={open.label}
                  files={open.files.filter((f) => f.source === 'drive').length}
                  locale={locale}
                />
              )}
            </div>
          )}
          {(['budget', 'result'] as const).map((kind) => {
            const rows = open.files
              .filter((f) => f.kind === kind)
              .sort((a, b) => a.post.localeCompare(b.post) || a.name.localeCompare(b.name));
            const onSite = rows.filter((f) => f.source !== 'drive');
            const driveOnly = rows.filter((f) => f.source === 'drive');
            return (
              <section key={kind} className="space-y-2" aria-label={kind}>
                <h2 className="vtk-fold-sub">
                  <span className="vtk-fold-subicon">
                    <FolderIcon open />
                  </span>
                  {kind === 'budget' ? (nl ? 'Budgetten' : 'Budgets') : nl ? 'Resultaten' : 'Results'}
                  <small>{rows.length}</small>
                </h2>
                {rows.length === 0 ? (
                  <p className="vtk-fold-empty">
                    {kind === 'budget'
                      ? nl
                        ? 'Geen budgetten in deze map.'
                        : 'No budgets in this folder.'
                      : nl
                        ? 'Geen resultaten in deze map.'
                        : 'No results in this folder.'}
                  </p>
                ) : onSite.length > 0 && driveOnly.length > 0 ? (
                  <>
                    <h3 className="vtk-fold-part">
                      {nl ? 'Op de site' : 'On the site'} <small>{onSite.length}</small>
                    </h3>
                    {fileTable(onSite.map((file) => ({ file })))}
                    <h3 className="vtk-fold-part">
                      {nl ? 'Enkel in Drive' : 'In Drive only'} <small>{driveOnly.length}</small>
                    </h3>
                    {fileTable(driveOnly.map((file) => ({ file })))}
                  </>
                ) : (
                  fileTable(rows.map((file) => ({ file })))
                )}
              </section>
            );
          })}
          {open.hidden.length > 0 && (
            <section className="space-y-2" aria-label={nl ? 'Telt niet mee' : 'Not counted'}>
              <h2 className="vtk-fold-sub">
                <span className="vtk-fold-subicon">
                  <FolderIcon open />
                </span>
                {nl ? 'Telt niet mee' : 'Not counted'}
                <small>{open.hidden.length}</small>
              </h2>
              <p className="text-sm text-vtk-muted">
                {nl
                  ? 'Deze bestanden staan in de map in Drive, maar zijn met "Niet meetellen" uit het overzicht gehaald. Zet er een terug wanneer het toch meetelt.'
                  : 'These files are in the Drive folder, but were taken out of the overview with "Do not count". Restore one when it does count.'}
              </p>
              <div className="vtk-fold-list">
                <table>
                  <thead>
                    <tr>
                      <th>{nl ? 'Naam' : 'Name'}</th>
                      <th>{nl ? 'Weggezet' : 'Put away'}</th>
                      <th>
                        <span className="sr-only">{nl ? 'Acties' : 'Actions'}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.hidden.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <a href={doc.webUrl} target="_blank" rel="noreferrer" className="vtk-fold-name">
                            <FileIcon source="drive" />
                            <span>
                              {doc.name}
                              {doc.sheetName && (
                                <small>
                                  {nl ? `blad heet nu ${doc.sheetName}` : `sheet is now called ${doc.sheetName}`}
                                </small>
                              )}
                            </span>
                          </a>
                        </td>
                        <td data-label={nl ? 'Weggezet' : 'Put away'}>{doc.hiddenAt ? hiddenOn(doc.hiddenAt) : '–'}</td>
                        <td>
                          <RestoreFileButton
                            docId={doc.id}
                            name={doc.name}
                            locale={locale}
                            errorMessages={errorMessages}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : folders.length === 0 ? (
        <p className="vtk-fold-empty">
          {nl
            ? 'Er is dit werkingsjaar nog niets van je post langs het BO gepasseerd.'
            : 'Nothing of your post has passed the board meeting yet this working year.'}
        </p>
      ) : (
        <ul className="vtk-fold-rows">
          {folders.map((f) => {
            const budgets = f.files.filter((x) => x.kind === 'budget').length;
            const results = f.files.length - budgets;
            return (
              <li key={f.id}>
                <Link
                  href={`${here}?map=${encodeURIComponent(f.id)}`}
                  className="vtk-fold-row"
                  data-upcoming={f.upcoming ? '1' : undefined}
                >
                  <span className="vtk-fold-rowicon">
                    <FolderIcon />
                  </span>
                  <b>{f.label}</b>
                  <span className="vtk-fold-rowdate">
                    {[
                      // Een map zonder naam in Drive heet al naar haar datum: die niet twee keer.
                      !f.date
                        ? nl
                          ? 'zonder datum'
                          : 'no date'
                        : f.label.includes(shortDate(f.date, nl))
                          ? ''
                          : shortDate(f.date, nl),
                      f.upcoming ? (nl ? 'komt nog' : 'upcoming') : '',
                      // Staat in Drive, maar telt niet mee: anders lijkt de map hier kleiner dan in Drive.
                      f.hidden.length > 0
                        ? nl
                          ? `${f.hidden.length} ${f.hidden.length === 1 ? 'telt' : 'tellen'} niet mee`
                          : `${f.hidden.length} not counted`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span className="vtk-fold-rowcount">
                    {nl
                      ? `${budgets} ${budgets === 1 ? 'budget' : 'budgetten'}`
                      : `${budgets} ${budgets === 1 ? 'budget' : 'budgets'}`}
                  </span>
                  <span className="vtk-fold-rowcount">
                    {nl
                      ? `${results} ${results === 1 ? 'resultaat' : 'resultaten'}`
                      : `${results} ${results === 1 ? 'result' : 'results'}`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {/* Groep 5: wat al met een rekenblad passeerde, alsnog op de site zetten. */}
      {all && !needle && (
        <AdminDisclosure
          className="vtk-fold-import"
          summary={
            <span className="block">
              <span className="block text-sm font-semibold text-vtk-ink">
                {nl ? 'Rekenbladen opladen' : 'Upload spreadsheets'}
              </span>
              <span className="block text-xs text-vtk-muted">
                {nl
                  ? 'Budgetten of resultaten die al met een rekenblad passeerden, alsnog op de site zetten.'
                  : 'Put budgets or results that passed as a spreadsheet on the site.'}
              </span>
            </span>
          }
        >
          <BudgetUpload locale={locale} defaultDate={open?.date ?? null} />
        </AdminDisclosure>
      )}
    </div>
  );
}
