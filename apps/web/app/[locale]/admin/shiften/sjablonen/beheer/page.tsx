import { prisma } from '@vtk/db';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/locale';
import { requirePermission } from '@/lib/session';
import { listShiftTemplates } from '@/lib/shift/templateStore';
import type { Locale } from '@vtk/i18n';
import { ShiftTemplateNav } from '../ShiftTemplateNav';
import { ShiftTemplateManager } from './ShiftTemplateManager';

/**
 * De sjablonen zelf bewerken: welke shiften een cantus of een verkoopdag telkens
 * nodig heeft.
 *
 * Eigen recht (`shift.templates`) en niet `shift.edit`: dat laatste zet shiften
 * neer voor één avond, dit verandert de reeks die iederéén daarna neerzet.
 */
export default async function AdminShiftTemplateManage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const session = await requirePermission('shift.templates');

  const nl = locale === 'nl';

  const [templates, activeGroups] = await Promise.all([
    listShiftTemplates(),
    prisma.group.findMany({
      where: { active: true, type: 'PRAESIDIUM' },
      orderBy: { orderInPraesidium: 'asc' },
      select: { code: true },
    }),
  ]);

  // Dezelfde regel als de server action: je eigen posten, plus de posten die de
  // sjablonen nu al gebruiken. Zonder dat laatste zou wie de cantusreeks komt
  // bijstellen de post ACTIVITEITEN stilletjes uit de keuzelijst zien vallen.
  const inUse = new Set(
    templates.flatMap((template) => [template.post, ...template.shifts.map((shift) => shift.post)]),
  );
  const own = new Set(session.groups.filter((g) => g.type === 'PRAESIDIUM').map((g) => g.code));
  const postOptions = activeGroups
    .map((g) => g.code)
    .filter((code) => session.user.isSuperAdmin || own.has(code) || inUse.has(code));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{nl ? 'Shiftsjablonen' : 'Shift templates'}</h1>
      <ShiftTemplateNav locale={locale} current="manage" canManage />
      <p className="max-w-3xl text-sm text-[#5c667f]">
        {nl
          ? 'Een sjabloon is de vaste reeks shiften van een evenement dat telkens terugkomt: een cantus, een TD, een verkoopdag. Wie shiften mag aanmaken, zet ze hiermee in twee klikken neer. Wat je hier wijzigt, geldt vanaf de volgende reeks; shiften die al op de kalender staan, blijven met hun inschrijvingen ongemoeid.'
          : 'A template is the fixed series of shifts of a recurring event: a cantus, a party, a sales day. Anyone who may create shifts puts them down with it in two clicks. What you change here applies from the next series onwards; shifts already on the calendar keep their sign-ups and stay as they are.'}
      </p>
      <ShiftTemplateManager locale={locale} templates={templates} postOptions={postOptions} />
    </div>
  );
}
