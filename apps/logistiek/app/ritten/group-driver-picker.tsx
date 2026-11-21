'use client';

import { useTransition } from 'react';
import { setGroupTripDriverAction } from '@/app/actions/uitleen';
import { useToast } from '@vtk/ui/toast';
import { UNSENT, unsentGuard } from '@vtk/ui/unsent-guard';
import type { LogistiekLocale } from '@/lib/i18n-shared';

/** De teksten van de keuzelijst, in beide talen (N3); `/ritten` volgt de taal van de bezoeker. */
const PICKER_COPY = {
  nl: {
    saved: 'Opgeslagen.',
    nobodyListed: (group: string) => `Niemand van ${group} staat in de chauffeurslijst.`,
    mail: 'Mail',
    mailRest: 'met wie er bij jullie mag rijden, dan kan je hier zelf een chauffeur kiezen.',
    driverOf: (group: string) => `Chauffeur van ${group}`,
    groupPicks: (group: string) => `${group} kiest zelf wie rijdt`,
    nobodyYet: 'Nog niemand',
    assignedDriver: 'De aangeduide chauffeur',
  },
  en: {
    saved: 'Saved.',
    nobodyListed: (group: string) => `Nobody from ${group} is on the driver list.`,
    mail: 'Mail',
    mailRest: 'with who may drive for you, then you can pick a driver here yourself.',
    driverOf: (group: string) => `Driver for ${group}`,
    groupPicks: (group: string) => `${group} picks who drives`,
    nobodyYet: 'Nobody yet',
    assignedDriver: 'The assigned driver',
  },
} as const;

/**
 * Wie rijdt deze rit? Ingevuld door de post zelf.
 *
 * Verschijnt enkel op een rit die Logistiek aan jouw post doorgaf. Een
 * keuzelijst en geen "meld je aan"-knop: de verantwoordelijke die de mail kreeg,
 * zet meestal iemand anders op de rit, en een knop die enkel jezelf kan
 * aanduiden dwingt hem eerst die persoon te laten inloggen.
 *
 * De lijst is de doorsnede van de post en de chauffeurspool (`groupMemberOptions`,
 * F4.9): wie mag rijden, beslist Logistiek en niet de post die iets te vervoeren
 * heeft. **Is die doorsnede leeg, dan staat hier geen keuzelijst maar een zin
 * die zegt wat er ontbreekt en bij wie je dan moet zijn.** Een select zonder
 * opties ziet eruit als een scherm dat stuk is, en dan mailt niemand.
 */
export function GroupDriverPicker({
  bookingId,
  driverId,
  members,
  groupName,
  locale,
}: {
  bookingId: string;
  driverId: string | null;
  /** De leden van de post waaraan de rit doorgegeven is. */
  members: Array<{ id: string; name: string }>;
  groupName: string;
  locale: LogistiekLocale;
}) {
  const t = PICKER_COPY[locale];
  const showToast = useToast();
  const [pending, startTransition] = useTransition();

  function choose(next: string) {
    startTransition(async () => {
      const result = await unsentGuard.run(() => setGroupTripDriverAction(bookingId, next));
      if (result === UNSENT) return;
      if (result.ok) {
        showToast({ message: result.message ?? t.saved, variant: 'success' });
      } else {
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  // Niemand van deze post staat in de chauffeurslijst. De rit blijft staan en
  // Logistiek kan er nog altijd zelf iemand op zetten; wat hier ontbreekt is de
  // keuze, en dat is precies wat er moet staan.
  if (members.length === 0 && !driverId) {
    return (
      <p className="trips-picker" data-empty="true">
        <span className="trips-picker-label">{t.nobodyListed(groupName)}</span>
        <span>
          {t.mail}{' '}
          <a href="mailto:logistiek@vtk.be" className="font-medium text-vtk-navy underline underline-offset-4">
            logistiek@vtk.be
          </a>{' '}
          {t.mailRest}
        </span>
      </p>
    );
  }

  // Geel zolang er niemand op staat: dat is de taak waarvoor de post hier komt.
  return (
    <label className="trips-picker" data-empty={driverId ? undefined : 'true'}>
      <span className="trips-picker-label">
        {driverId ? t.driverOf(groupName) : t.groupPicks(groupName)}
      </span>
      <select value={driverId ?? ''} disabled={pending} onChange={(event) => choose(event.target.value)}>
        <option value="">{t.nobodyYet}</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
        {/* Iemand van buiten de post die Logistiek er al op zette (of iemand uit
            de chauffeurslijst): zonder deze regel valt de lijst terug op "nog
            niemand" terwijl er wel degelijk iemand rijdt. */}
        {driverId && !members.some((member) => member.id === driverId) ? (
          <option value={driverId}>{t.assignedDriver}</option>
        ) : null}
      </select>
    </label>
  );
}
