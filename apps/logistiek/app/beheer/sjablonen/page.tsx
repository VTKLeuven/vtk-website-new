import { requireManage } from '@/lib/session';
import { adminRequestTemplates, getCatalog } from '@/lib/uitleen-server';
import { TemplatesManager } from './templates-manager';

export default async function BeheerSjablonenPage() {
  await requireManage();
  // Dezelfde catalogus als het aanvraagformulier: enkel actieve items, per
  // categorie. Een sjabloon dat naar een gearchiveerd item wijst, zou toch
  // overgeslagen worden.
  const [templates, catalog] = await Promise.all([adminRequestTemplates(), getCatalog()]);
  return <TemplatesManager templates={templates} catalog={catalog} />;
}
