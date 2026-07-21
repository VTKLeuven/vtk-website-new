import { requireManage } from '@/lib/session';
import { adminVehicles, getLogistiekSettings } from '@/lib/uitleen-server';
import { GeneralSettings, VehicleSettings } from './settings-forms';

export default async function BeheerInstellingenPage() {
  await requireManage();
  const [vehicles, settings] = await Promise.all([adminVehicles(), getLogistiekSettings()]);

  return (
    <div className="grid gap-6">
      <VehicleSettings vehicles={vehicles} />
      <GeneralSettings showRentPrices={settings.showRentPrices} />
    </div>
  );
}
