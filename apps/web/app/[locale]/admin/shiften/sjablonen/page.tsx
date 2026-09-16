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
  const base = nl ? '' : '/en';
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
      <h1 className="text-2xl font-semibold">{nl ? 'Shiften uit sjabloon' : 'Shifts from template'}</h1>
      <ShiftTemplateNav locale={locale} current="build" canManage={canManage} />
      <p className="max-w-3xl text-sm text-[#5c667f]">
        {nl
          ? 'Kies een sjabloon, zet datum, uur en locatie goed, en verfijn daarna de shiften zelf. Bij opslaan worden ze meteen aangemaakt en staan ze op de shiftpagina.'
          : 'Pick a template, set date, time and location, then fine-tune the individual shifts. On save they are created and appear on the shift page right away.'}
      </p>
      {templates.length === 0 ? (
        <p className="max-w-3xl text-sm text-[#5c667f]">
          {nl ? (
            <>
              Er staat nog geen enkel sjabloon klaar.{' '}
              {canManage ? (
                <a className="text-vtk-blue underline" href={`${base}/admin/shiften/sjablonen/beheer`}>
                  Maak er eerst een aan
                </a>
              ) : (
                'Vraag aan wie de sjablonen beheert om er een klaar te zetten'
              )}
              .
            </>
          ) : (
            <>
              There are no templates yet.{' '}
              {canManage ? (
                <a className="text-vtk-blue underline" href={`${base}/admin/shiften/sjablonen/beheer`}>
                  Create one first
                </a>
              ) : (
                'Ask whoever manages the templates to set one up'
              )}
              .
            </>
          )}
        </p>
      ) : (
        <ShiftTemplateBuilder
          locale={locale}
          templates={templates}
          today={utcToLocalDateTime(new Date()).slice(0, 10)}
          postOptions={postOptions}
        />
      )}
    </div>
  );
}
