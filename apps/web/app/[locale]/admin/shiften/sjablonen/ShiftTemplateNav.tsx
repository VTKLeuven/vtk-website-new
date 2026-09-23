import Link from '@/components/ui/Link';
import type { Locale } from '@vtk/i18n';

/**
 * De twee schermen rond de sjablonen: er een reeks mee neerzetten, en ze
 * bewerken. Bewust twee pagina's en geen tabs: het ene is een lang formulier dat
 * je halverwege niet wil kwijtspelen omdat je op een tab klikte.
 *
 * Wie het beheerrecht niet heeft, krijgt de tweede link niet te zien; hij is dan
 * ook niet bereikbaar, en een link naar een scherm dat je niet mag is erger dan
 * geen link.
 */
export function ShiftTemplateNav({
  locale,
  current,
  canManage,
}: {
  locale: Locale;
  current: 'build' | 'manage';
  canManage: boolean;
}) {
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';

  const links: { key: 'build' | 'manage'; href: string; label: string }[] = [
    { key: 'build', href: `${base}/admin/shiften/sjablonen`, label: nl ? 'Shiften aanmaken' : 'Create shifts' },
    ...(canManage
      ? [
          {
            key: 'manage' as const,
            href: `${base}/admin/shiften/sjablonen/beheer`,
            label: nl ? 'Sjablonen beheren' : 'Manage templates',
          },
        ]
      : []),
  ];

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {links.map((link) => (
        <Link
          key={link.key}
          href={link.href}
          aria-current={link.key === current ? 'page' : undefined}
          className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors ${
            link.key === current
              ? 'bg-vtk-ink text-white'
              : 'border border-vtk-blue/15 text-vtk-ink hover:border-vtk-blue/30 hover:bg-vtk-blue-soft/70'
          }`}
        >
          {link.label}
        </Link>
      ))}
      <Link
        href={`${base}/admin/shiften`}
        className="ml-auto text-sm text-vtk-blue underline"
      >
        {nl ? 'Naar het shiftoverzicht' : 'To the shift overview'}
      </Link>
    </nav>
  );
}
