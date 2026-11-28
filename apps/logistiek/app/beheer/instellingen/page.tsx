import { requireManage } from '@/lib/session';
import {
  adminVehicles,
  bezettingOpensPlanning,
  feedTokensForUser,
  getLogistiekSettings,
  isDriver,
} from '@/lib/uitleen-server';
import { PlanningShortcut } from './planning-shortcut';
import { FeedTokens } from '@/components/feed-tokens';
import { GeneralSettings, VehicleSettings } from './settings-forms';

export const metadata = { title: 'Instellingen' };

export default async function BeheerInstellingenPage() {
  const session = await requireManage();
  const [vehicles, settings, tokens, driver, planningShortcut] = await Promise.all([
    adminVehicles(),
    getLogistiekSettings(),
    feedTokensForUser(session.user.id),
    isDriver(session.user.id),
    bezettingOpensPlanning(session.user.id),
  ]);

  return (
    <div className="grid gap-6">
      <VehicleSettings vehicles={vehicles} />
      <GeneralSettings
        showRentPrices={settings.showRentPrices}
        lastMinuteDays={settings.lastMinuteDays}
        externalRequestsOpen={settings.externalRequestsOpen}
        notifyEmails={settings.notifyEmails}
        tripHandover={settings.tripHandover}
        statsMaxTripHours={settings.statsMaxTripHours}
      />
      {/* Wat enkel voor jou geldt, apart van wat voor het hele team geldt. */}
      <PlanningShortcut initial={planningShortcut} />
      <FeedTokens
        canTeam
        canDriver={driver}
        tokens={tokens.map((token) => ({
          id: token.id,
          label: token.label,
          scope: token.scope,
          createdAt: token.createdAt.toISOString(),
          lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
          expired: token.expired,
        }))}
      />
    </div>
  );
}
