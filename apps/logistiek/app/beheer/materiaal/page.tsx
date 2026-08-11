import { requireManage } from '@/lib/session';
import { adminInventory, adminRequestTemplates } from '@/lib/uitleen-server';
import { InventoryManager } from './inventory-manager';
import { TemplatesPanel } from './templates-panel';

export default async function BeheerMateriaalPage() {
  await requireManage();
  const [{ categories, items }, templates] = await Promise.all([
    adminInventory(),
    adminRequestTemplates(),
  ]);
  return (
    <div className="grid gap-6">
      <InventoryManager categories={categories} items={items} />
      {/* Onderaan en niet als eigen tab: sjablonen zijn iets wat je een paar keer
          per jaar aanraakt, en een tiende tab in de beheernavigatie kost meer dan
          hij oplevert. */}
      <TemplatesPanel templates={templates} />
    </div>
  );
}
