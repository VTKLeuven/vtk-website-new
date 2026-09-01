import { requireManage } from '@/lib/session';
import { adminVehicles, feedTokensForUser, getLogistiekSettings, isDriver } from '@/lib/uitleen-server';
import { FeedTokens } from '@/components/feed-tokens';
import { GeneralSettings, VehicleSettings } from './settings-forms';

export default async function BeheerInstellingenPage() {
  const session = await requireManage();
  const [vehicles, settings, tokens, driver] = await Promise.all([
    adminVehicles(),
    getLogistiekSettings(),
    feedTokensForUser(session.user.id),
    isDriver(session.user.id),
  ]);

  return (
    <div className="grid gap-6">
      <VehicleSettings vehicles={vehicles} />
      <GeneralSettings
        showRentPrices={settings.showRentPrices}
        lastMinuteDays={settings.lastMinuteDays}
        externalRequestsOpen={settings.externalRequestsOpen}
        notifyEmails={settings.notifyEmails}
      />
      <FeedTokens
        canTeam
        canDriver={driver}
        tokens={tokens.map((token) => ({
          id: token.id,
          label: token.label,
          scope: token.scope,
          createdAt: token.createdAt.toISOString(),
          lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
