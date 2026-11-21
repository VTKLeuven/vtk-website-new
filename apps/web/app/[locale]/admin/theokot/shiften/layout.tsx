import { notFound } from 'next/navigation';
import { KeyRound, Users } from 'lucide-react';
import { hasLocale } from '@/lib/locale';
import { requirePermission } from '@/lib/session';
import { ModuleAdminShell, type ModuleTab } from '@/components/admin/ModuleAdminShell';

import '@/app/design/vtk-theokot-shiften.css';

const ICON = { 'aria-hidden': true, size: 15, strokeWidth: 1.8 } as const;

/**
 * De shiften van Theokot in twee tabbladen: de shifters (waar er nog iemand
 * nodig is) en de verantwoordelijken (wie de zaak openhoudt). De gekozen week
 * reist mee van het ene tabblad naar het andere. Zie docs/design-decisions.md,
 * "Theokot: shiftenoverzicht" en "Theokot: verantwoordelijken".
 */
export default async function TheokotShiftsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission('theokot.manage');
  const nl = locale === 'nl';
  const base = `${nl ? '' : '/en'}/admin/theokot/shiften`;
  const tabs: ModuleTab[] = [
    { href: base, label: nl ? 'Shifters' : 'Shifters', icon: <Users {...ICON} />, segments: [null] },
    {
      href: `${base}/verantwoordelijken`,
      label: nl ? 'Verantwoordelijken' : 'Duty managers',
      icon: <KeyRound {...ICON} />,
      segments: ['verantwoordelijken'],
    },
  ];
  return (
    <ModuleAdminShell
      title={nl ? 'Theokot · Shiften' : 'Theokot · Shifts'}
      navLabel="Theokot"
      tabs={tabs}
      preserveParams={['week']}
    >
      {children}
    </ModuleAdminShell>
  );
}
