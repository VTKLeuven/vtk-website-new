import { requireManage } from '@/lib/session';
import { adminInventory } from '@/lib/uitleen-server';
import { InventoryManager } from './inventory-manager';

export default async function BeheerMateriaalPage() {
  await requireManage();
  const { categories, items } = await adminInventory();
  return <InventoryManager categories={categories} items={items} />;
}
