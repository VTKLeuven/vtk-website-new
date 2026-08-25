import { prisma } from '@vtk/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { hasLocale } from '@/lib/locale';
import { requirePermission } from '@/lib/session';
import { utcToLocalDateTime } from '@/lib/ticketing/time';
import type { Locale } from '@vtk/i18n';
import { ShiftTemplateBuilder } from './ShiftTemplateBuilder';
import { SHIFT_TEMPLATES } from '@/lib/shift/templates';

export default async function AdminShiftTemplates({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const session = await requirePermission('shift.edit');

  const nl = locale === 'nl';
  const base = nl ? '' : '/en';

  // Zelfde keuzelijst als het gewone shiftformulier: enkel actieve posten.
  const activeGroups = await prisma.group.findMany({
    where: { active: true, type: 'PRAESIDIUM' },
    orderBy: { orderInPraesidium: 'asc' },
    select: { code: true },
  });

  const userPostCodes = session.groups.filter((g) => g.type === 'PRAESIDIUM').map((g) => g.code);
  const postOptions = session.user.isSuperAdmin
    ? activeGroups.map((g) => g.code)
    : activeGroups.map((g) => g.code).filter((code) => userPostCodes.includes(code));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">{nl ? 'Shiften uit sjabloon' : 'Shifts from template'}</h1>
        <Link href={`${base}/admin/shiften`} className="text-sm text-vtk-blue underline">
          {nl ? 'Naar het shiftoverzicht' : 'To the shift overview'}
        </Link>
      </div>
      <p className="max-w-3xl text-sm text-zinc-500">
        {nl
          ? 'Kies een sjabloon, zet datum, uur en locatie goed, en verfijn daarna de shiften zelf. Bij opslaan worden ze meteen aangemaakt en staan ze op de shiftpagina.'
          : 'Pick a template, set date, time and location, then fine-tune the individual shifts. On save they are created and appear on the shift page right away.'}
      </p>
      <ShiftTemplateBuilder
        locale={locale}
        templates={SHIFT_TEMPLATES}
        today={utcToLocalDateTime(new Date()).slice(0, 10)}
        postOptions={postOptions}
      />
    </div>
  );
}
