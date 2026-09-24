import { prisma } from '@vtk/db';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/locale';
import { requirePermission } from '@/lib/session';
import { listShiftTemplates } from '@/lib/shift/templateStore';
import { utcToLocalDateTime } from '@/lib/ticketing/time';
import type { Locale } from '@vtk/i18n';
import { ShiftTemplateBuilder } from './ShiftTemplateBuilder';
import { ShiftTemplateNav } from './ShiftTemplateNav';

export default async function AdminShiftTemplates({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const session = await requirePermission('shift.edit');

  const nl = locale === 'nl';
  const canManage = session.user.isSuperAdmin || session.permissions.includes('shift.templates');

  // Zelfde keuzelijst als het gewone shiftformulier: enkel actieve posten.
  const [templates, activeGroups] = await Promise.all([
    listShiftTemplates(),
    prisma.group.findMany({
      where: { active: true, type: 'PRAESIDIUM' },
      orderBy: { orderInPraesidium: 'asc' },
      select: { code: true },
    }),
  ]);

  const userPostCodes = session.groups.filter((g) => g.type === 'PRAESIDIUM').map((g) => g.code);
  const postOptions = session.user.isSuperAdmin
    ? activeGroups.map((g) => g.code)
    : activeGroups.map((g) => g.code).filter((code) => userPostCodes.includes(code));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{nl ? 'Meerdere shiften aanmaken' : 'Create multiple shifts'}</h1>
      <ShiftTemplateNav locale={locale} current="build" canManage={canManage} />
      <p className="max-w-3xl text-sm text-vtk-muted">
        {nl
          ? 'Maak meerdere shiften of een hele reeks in één keer aan. Je kan vertrekken vanaf nul of optioneel een sjabloon kiezen als startpunt. Bij opslaan worden ze meteen aangemaakt en staan ze op de shiftpagina.'
          : 'Create multiple shifts or an entire series in one go. You can start from scratch or optionally pick a template as a starting point. On save they are created and appear on the shift page right away.'}
      </p>
      {postOptions.length === 0 && (
        <p className="max-w-3xl text-sm text-vtk-danger">
          {nl
            ? 'Je zit dit werkingsjaar in geen enkele actieve post, dus je kan hier geen shiften aanmaken.'
            : 'You are not in any active post this working year, so you cannot create shifts here.'}
        </p>
      )}
      <ShiftTemplateBuilder
        locale={locale}
        templates={templates}
        today={utcToLocalDateTime(new Date()).slice(0, 10)}
        postOptions={postOptions}
        allowNoPost={session.user.isSuperAdmin}
      />
    </div>
  );
}
