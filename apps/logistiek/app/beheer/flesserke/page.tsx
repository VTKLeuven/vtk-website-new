import { requireManage } from '@/lib/session';
import { adminFlesserke } from '@/lib/uitleen-server';
import { FlesserkeManager } from './flesserke-manager';

export default async function BeheerFlesserkePage() {
  await requireManage();
  const { categories, items } = await adminFlesserke();
  return <FlesserkeManager categories={categories} items={items} />;
}
