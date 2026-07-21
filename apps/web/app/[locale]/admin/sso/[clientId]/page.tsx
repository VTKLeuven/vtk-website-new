import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/locale';
import { requirePermission } from '@/lib/session';
import { prisma } from '@vtk/db';
import {
  accessRoleGrantCount,
  countMembersWithAccess,
  getSsoClient,
  listClientGrants,
  listClientPermissions,
  listSsoAuditLog,
} from '@vtk/auth/server';
import { SCOPES } from '@vtk/auth';
import type { Locale } from '@vtk/i18n';
import { attentionFor } from '../attention';
import { ClientEditor } from './ClientEditor';
import { ClientPermissions } from './ClientPermissions';

export default async function SsoClientDetail({ params }: { params: Promise<{ locale: string; clientId: string }> }) {
  const { locale: localeParam, clientId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission('oauth.client.edit');

  const requestHeaders = await headers();
  const client = await getSsoClient(requestHeaders, clientId);
  if (!client) notFound();

  const audit = await listSsoAuditLog(requestHeaders, { clientId, take: 25 });

  // Rollen en posten worden hier geladen en als naam meegegeven: het
  // toekenningsformulier toont namen, terwijl de grants enkel id's bevatten.
  // Twee verschillende vragen, dus twee tellingen. Het formulier waarschuwt of
  // er überhaupt iemand binnen raakt (elk pad telt); "Aandacht vereist" kijkt of
  // toegang via een rol geregeld is (zie attention.ts).
  const [permissions, grants, roles, groups, accessGrantCount, accessRoleGrants] = await Promise.all([
    listClientPermissions(requestHeaders, clientId),
    listClientGrants(requestHeaders, clientId),
    prisma.role.findMany({ orderBy: { order: 'asc' }, select: { id: true, nameNl: true, nameEn: true } }),
    prisma.group.findMany({
      where: { active: true },
      orderBy: { orderInPraesidium: 'asc' },
      select: { id: true, nameNl: true, nameEn: true },
    }),
    countMembersWithAccess(clientId),
    accessRoleGrantCount(requestHeaders, clientId),
  ]);

  const warnings = attentionFor(client, accessRoleGrants);
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';

  const stampFmt = new Intl.DateTimeFormat(nl ? 'nl-BE' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`${base}/admin/sso`} className="text-sm text-zinc-500 underline">
          {nl ? '← Alle applicaties' : '← All applications'}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{client.name ?? client.clientId}</h1>
        <code className="text-xs text-zinc-500">{client.clientId}</code>
      </div>

      {warnings.length > 0 && (
        <ul className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {warnings.map((w) => (
            <li key={w.code}>{w.message}</li>
          ))}
        </ul>
      )}

      <ClientEditor
        nl={nl}
        listHref={`${base}/admin/sso`}
        scopes={SCOPES.map((scope) => ({
          code: scope.code,
          label: nl ? scope.consentNl : scope.consentEn,
          sensitive: scope.sensitive,
        }))}
        client={{
          clientId: client.clientId,
          name: client.name ?? '',
          redirectUris: client.redirectUris,
          clientUri: client.uri ?? '',
          contacts: client.contacts,
          scopes: client.scopes,
          skipConsent: !!client.skipConsent,
          disabled: !!client.disabled,
          isPublic: !client.clientSecret,
        }}
      />

      <ClientPermissions
        nl={nl}
        clientId={client.clientId}
        accessMode={client.accessMode}
        permissionNamespace={client.permissionNamespace}
        accessGrantCount={accessGrantCount}
        permissions={permissions.map((permission) => ({
          id: permission.id,
          code: permission.code,
          labelNl: permission.labelNl,
          labelEn: permission.labelEn,
          system: permission.system,
          deprecated: permission.deprecated,
        }))}
        grants={{ roles: grants.roles, groups: grants.groups }}
        roles={roles.map((role) => ({ id: role.id, name: nl ? role.nameNl : role.nameEn }))}
        groups={groups.map((group) => ({ id: group.id, name: nl ? group.nameNl : group.nameEn }))}
      />

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">{nl ? 'Geschiedenis' : 'History'}</h2>
        {audit.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">{nl ? 'Nog niets gebeurd.' : 'Nothing yet.'}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {audit.map((row) => (
              <li key={row.id} className="flex gap-3">
                <span className="w-32 shrink-0 text-zinc-500">{stampFmt.format(row.createdAt)}</span>
                <span className="font-medium">{row.actorName}</span>
                <span className="text-zinc-600">
                  {row.action}
                  {row.summary ? `, ${row.summary}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
