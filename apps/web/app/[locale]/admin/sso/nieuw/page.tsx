import { notFound } from 'next/navigation';
import Link from 'next/link';
import { hasLocale } from '@/lib/locale';
import { requirePermission } from '@/lib/session';
import { SCOPES } from '@vtk/auth';
import { NewClientWizard } from './NewClientWizard';

export default async function NewSsoClientPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission('oauth.client.edit');

  const nl = locale === 'nl';
  const base = nl ? '' : '/en';

  // De registry is server-side; geef enkel door wat het scherm nodig heeft.
  const scopes = SCOPES.map((scope) => ({
    code: scope.code,
    label: nl ? scope.consentNl : scope.consentEn,
    sensitive: scope.sensitive,
    defaultSelected: scope.defaultSelected,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`${base}/admin/sso`} className="text-sm text-zinc-500 underline">
          {nl ? '← Alle applicaties' : '← All applications'}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{nl ? 'Nieuwe applicatie' : 'New application'}</h1>
      </div>

      <NewClientWizard nl={nl} scopes={scopes} listHref={`${base}/admin/sso`} />
    </div>
  );
}
