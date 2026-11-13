import { notFound } from 'next/navigation';
import type { Locale } from '@vtk/i18n';
import { hasPermission } from '@vtk/auth';
import Link from '@/components/ui/Link';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { currentWorkingYear, formatWorkingYear } from '@/lib/workingYear';
import { loadBoOverview } from '@/lib/bo/overview';
import { toExplorerData, type XDoc, type XDossier } from '@/lib/bo/explorer';
import { ownPostKeys } from '@/lib/bo/own';
import { getBudgetSettings, listFolderBudgets, postNames } from '@/lib/bo/budget/server';
import { BudgetUpload, DriveImportButton } from '@/components/bo-budget/BudgetImport';
import { money, shortDate } from '@/components/bo-budget/format';

/*
 * /admin/bestuursorgaan/mappen: per BO een map, zoals in Drive. Wie een budget
 * of resultaat zoekt, weet meestal op welke BO het passeerde, en zoekt dan
 * dáár, niet per post of per stand.
 *
 * In een map staan de rekenbladen uit de BO-map in Drive (gelezen door de
 * scan, de site schrijft daar niets) én de budgetten die op de site opgesteld
 * zijn voor die BO. Groep 5 ziet alles; een post ziet enkel wat van haar is.
 * Dat wordt hier op de server gefilterd: de pagina krijgt nooit het hele jaar
 * mee voor wie het niet mag zien (zie `lib/bo/own.ts`).
 */

type FileRow = {
  key: string;
  name: string;
  post: string;
  kind: 'budget' | 'result';
  cents: number | null;
  href: string;
  external: boolean;
  source: 'drive' | 'site';
  note?: string;
};

type Folder = {
  id: string;
  label: string;
  date: string | null;
  upcoming: boolean;
  driveUrl: string | null;
  files: FileRow[];
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

function FileIcon({ source }: { source: 'drive' | 'site' }) {
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
  const [{ overview }, settings] = await Promise.all([loadBoOverview(year, nl), getBudgetSettings()]);
  const data = toExplorerData(overview, year, new Date());
  const siteBudgets = await listFolderBudgets(all ? 'all' : ownKeys, settings);
  const names = await postNames([...new Set(siteBudgets.map((b) => b.postKey))], nl);

  // Enkel wat deze bezoeker mag zien: alles voor Groep 5, anders de eigen posten.
  const visible = (d: XDossier) => all || d.postKeys.some((k) => ownKeys.includes(k));
  const byMeeting = new Map<string, FileRow[]>();
  const push = (id: string, row: FileRow) => byMeeting.set(id, [...(byMeeting.get(id) ?? []), row]);
  for (const dossier of data.dossiers.filter(visible)) {
    const add = (doc: XDoc, kind: 'budget' | 'result') =>
      push(doc.meetingId, {
        key: `${doc.id}-${kind}`,
        name: dossier.activity,
        post: dossier.postName,
        kind,
        cents: doc.totalCents,
        href: doc.webUrl,
        external: true,
        source: 'drive',
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
    }));
  // Budgetten op de site: in de map van de BO waarvoor ze zijn, anders een eigen map.
  const loose: FileRow[] = [];
  for (const b of siteBudgets) {
    const row: FileRow = {
      key: `site-${b.id}`,
      name: b.title,
      post: names.get(b.postKey) ?? b.postKey,
      kind: b.hasResult ? 'result' : 'budget',
      cents: b.hasResult ? b.resultCents : b.totalCents,
      href: `${base}/admin/bestuursorgaan/mijn/${b.id}?weergave=nakijken`,
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
                <span className="vtk-bo-pill" data-tone={file.source === 'site' ? 'ok' : undefined}>
                  {file.source === 'site' ? (nl ? 'Site' : 'Site') : 'Drive'}
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
            {open || needle ? <Link href={here}>{nl ? 'Mappen per BO' : 'Folders per meeting'}</Link> : null}
            {open && <span aria-hidden="true">›</span>}
          </nav>
          <h1 className="text-2xl font-semibold">
            {open
              ? open.label
              : needle
                ? nl
                  ? `Zoeken: "${query.trim()}"`
                  : `Search: "${query.trim()}"`
                : nl
                  ? 'Mappen per BO'
                  : 'Folders per meeting'}
          </h1>
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
        <form action={here} method="get" className="vtk-fold-search" role="search">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={nl ? 'Zoek een activiteit of post' : 'Search an activity or post'}
            aria-label={nl ? 'Zoek in alle mappen' : 'Search all folders'}
          />
        </form>
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
                ) : (
                  fileTable(rows.map((file) => ({ file })))
                )}
              </section>
            );
          })}
        </>
      ) : folders.length === 0 ? (
        <p className="vtk-fold-empty">
          {nl
            ? 'Er is dit werkingsjaar nog niets van je post langs het BO gepasseerd.'
            : 'Nothing of your post has passed the board meeting yet this working year.'}
        </p>
      ) : (
        <ul className="vtk-fold-grid">
          {folders.map((f) => {
            const budgets = f.files.filter((x) => x.kind === 'budget').length;
            const results = f.files.length - budgets;
            return (
              <li key={f.id}>
                <Link
                  href={`${here}?map=${encodeURIComponent(f.id)}`}
                  className="vtk-fold-tile"
                  data-upcoming={f.upcoming ? '1' : undefined}
                >
                  <span className="vtk-fold-tileicon">
                    <FolderIcon />
                  </span>
                  <span className="vtk-fold-tiletext">
                    <b>{f.label}</b>
                    <span>
                      {f.date ? shortDate(f.date, nl) : nl ? 'zonder datum' : 'no date'}
                      {f.upcoming ? (nl ? ' · komt nog' : ' · upcoming') : ''}
                    </span>
                    <span>
                      {nl
                        ? `${budgets} ${budgets === 1 ? 'budget' : 'budgetten'}, ${results} ${results === 1 ? 'resultaat' : 'resultaten'}`
                        : `${budgets} budgets, ${results} results`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {/* Groep 5: wat al met een rekenblad passeerde, alsnog op de site zetten. */}
      {all && !needle && <BudgetUpload locale={locale} defaultDate={open?.date ?? null} />}
    </div>
  );
}
