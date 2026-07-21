'use client';

/**
 * De "Toegang"- en "Rechten"-secties van de clientdetailpagina.
 *
 * Twee dingen die uit elkaar gehouden moeten worden, want ze lijken op elkaar:
 * de **toegangsmodus** bepaalt of een lid überhaupt kan inloggen, de
 * **permissies** bepalen wat het er mag. Bij een beperkte client doet
 * `<namespace>.access` het eerste; alle andere codes doen het tweede.
 */
import { useEffect, useState } from 'react';
import { Button, Input } from '@vtk/ui';
import { SaveForm } from '@/components/ui/SaveForm';
import { DeleteIconButton } from '@/components/ui/DeleteIconButton';
import {
  createPermissionAction,
  deletePermissionAction,
  grantPermissionAction,
  revokePermissionAction,
  setAccessModeAction,
} from '../actions';

type Permission = {
  id: string;
  code: string;
  labelNl: string;
  labelEn: string;
  system: boolean;
  deprecated: boolean;
};

type Grants = {
  users: { id: string; permissionId: string; userId: string; userName: string; expiresAt: string | null }[];
  roles: { id: string; permissionId: string; roleId: string }[];
  groups: { id: string; permissionId: string; groupId: string; kind: 'DEFAULT' | 'LEADER' }[];
};

type Named = { id: string; name: string };
type SearchUser = { id: string; name: string; email: string; rNumber: string | null };

const errorMessagesNl: Record<string, string> = {
  NAMESPACE_INVALID: 'Ongeldige namespace: gebruik kleine letters, cijfers en streepjes.',
  NAMESPACE_RESERVED: 'Die namespace is van VTK zelf en kan niet gebruikt worden.',
  NAMESPACE_REQUIRED: 'Een beperkte applicatie heeft een namespace nodig.',
  CODE_INVALID: 'Ongeldige code. Bijvoorbeeld: wiki.read',
  CODE_WRONG_NAMESPACE: 'De code moet met de namespace van deze applicatie beginnen.',
  CODE_TAKEN: 'Die code bestaat al voor deze applicatie.',
  CODE_TOO_LONG: 'Die code is te lang.',
  TOO_MANY_PERMISSIONS: 'Deze applicatie heeft het maximum van 64 permissies bereikt.',
  SYSTEM_PERMISSION: 'De toegangspermissie kan niet weg zolang de applicatie beperkt is.',
};

const errorMessagesEn: Record<string, string> = {
  NAMESPACE_INVALID: 'Invalid namespace: use lowercase letters, digits and dashes.',
  NAMESPACE_RESERVED: 'That namespace belongs to VTK itself and cannot be used.',
  NAMESPACE_REQUIRED: 'A restricted application needs a namespace.',
  CODE_INVALID: 'Invalid code. For example: wiki.read',
  CODE_WRONG_NAMESPACE: "The code must start with this application's namespace.",
  CODE_TAKEN: 'That code already exists for this application.',
  CODE_TOO_LONG: 'That code is too long.',
  TOO_MANY_PERMISSIONS: 'This application has reached the maximum of 64 permissions.',
  SYSTEM_PERMISSION: 'The access permission cannot be removed while the application is restricted.',
};

export function ClientPermissions({
  nl,
  clientId,
  accessMode,
  permissionNamespace,
  accessGrantCount,
  permissions,
  grants,
  roles,
  groups,
}: {
  nl: boolean;
  clientId: string;
  accessMode: 'OPEN' | 'RESTRICTED';
  permissionNamespace: string | null;
  accessGrantCount: number;
  permissions: Permission[];
  grants: Grants;
  roles: Named[];
  groups: Named[];
}) {
  const errorMessages = nl ? errorMessagesNl : errorMessagesEn;
  const [mode, setMode] = useState(accessMode);
  const [namespace, setNamespace] = useState(permissionNamespace ?? '');

  return (
    <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">{nl ? 'Toegang' : 'Access'}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? 'Bepaalt wie kan inloggen bij deze applicatie. Bij "beperkt" wordt dat in de aanmeldflow geblokkeerd; de applicatie hoeft er zelf niets voor te doen.'
            : 'Decides who can sign in to this application. When restricted, the sign-in flow blocks it; the application itself does not have to do anything.'}
        </p>

        <SaveForm
          action={setAccessModeAction}
          submitLabel={nl ? 'Opslaan' : 'Save'}
          savingLabel={nl ? 'Opslaan…' : 'Saving…'}
          savedMessage={nl ? 'Toegang bijgewerkt' : 'Access updated'}
          fallbackErrorMessage={nl ? 'Opslaan mislukt' : 'Could not save'}
          errorMessages={errorMessages}
          className="mt-3 space-y-3"
        >
          <input type="hidden" name="clientId" value={clientId} />

          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="accessMode"
                value="OPEN"
                checked={mode === 'OPEN'}
                onChange={() => setMode('OPEN')}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{nl ? 'Open' : 'Open'}</span>
                <span className="block text-zinc-500">
                  {nl
                    ? 'Elk lid met een VTK-account kan inloggen. Permissies bepalen enkel wat iemand er méér mag.'
                    : 'Any member with a VTK account can sign in. Permissions only decide what someone may do extra.'}
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="accessMode"
                value="RESTRICTED"
                checked={mode === 'RESTRICTED'}
                onChange={() => setMode('RESTRICTED')}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{nl ? 'Beperkt' : 'Restricted'}</span>
                <span className="block text-zinc-500">
                  {nl
                    ? `Enkel wie de permissie ${namespace || '<namespace>'}.access houdt, raakt binnen. Die permissie wordt automatisch aangemaakt.`
                    : `Only members holding ${namespace || '<namespace>'}.access can get in. That permission is created automatically.`}
                </span>
              </span>
            </label>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[#5c667f]">
              {nl ? 'Namespace voor permissiecodes' : 'Namespace for permission codes'}
            </label>
            <Input
              name="permissionNamespace"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              placeholder="wiki"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-zinc-500">
              {nl
                ? 'Elke code van deze applicatie begint hiermee, bijvoorbeeld wiki.read.'
                : 'Every code for this application starts with this, for example wiki.read.'}
            </p>
          </div>

          {/* De faalwijze van dit ontwerp: de access-permissie vergeten toekennen
              sluit iedereen buiten, inclusief wie de knop omzet. Zeg dat vooraf. */}
          {mode === 'RESTRICTED' && accessGrantCount === 0 && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {nl
                ? 'Let op: niemand heeft deze toegangspermissie op dit moment. Zodra je dit opslaat, kan niemand nog inloggen bij deze applicatie tot je ze toekent, bij voorkeur aan een rol.'
                : 'Careful: nobody currently holds this access permission. Once you save, nobody can sign in to this application until you grant it, preferably to a role.'}
            </p>
          )}

          {mode === 'RESTRICTED' && accessMode === 'OPEN' && (
            <p className="text-xs text-zinc-500">
              {nl
                ? 'Bij het beperken worden de lopende tokens van deze applicatie ingetrokken. Een al uitgedeeld access token blijft geldig tot het vervalt (max. 10 minuten).'
                : 'Restricting revokes this application’s current tokens. An access token already handed out stays valid until it expires (max. 10 minutes).'}
            </p>
          )}
        </SaveForm>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">{nl ? 'Rechten' : 'Permissions'}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? 'Het vocabulaire dat deze applicatie zelf gebruikt. Leden krijgen deze codes via een VTK-rol, een post, of rechtstreeks; de applicatie leest ze uit de permissions-claim.'
            : 'The vocabulary this application uses. Members receive these codes through a VTK role, a post, or directly; the application reads them from the permissions claim.'}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? 'Toekennen kan ook vanaf het rollenscherm, onder "Externe apps". Dat is de gewone weg: wie rollen beheert hoeft daarvoor geen SSO-beheerder te zijn.'
            : 'Granting can also be done from the roles screen, under "External apps". That is the normal route: whoever manages roles does not have to be an SSO administrator.'}
        </p>

        {!permissionNamespace ? (
          <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
            {nl
              ? 'Stel eerst een namespace in bij "Toegang" hierboven; zonder namespace kan er geen code aangemaakt worden.'
              : 'Set a namespace under "Access" above first; without one no code can be created.'}
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-3">
              {permissions.length === 0 && (
                <li className="text-sm text-zinc-500">{nl ? 'Nog geen permissies.' : 'No permissions yet.'}</li>
              )}
              {permissions.map((permission) => (
                <PermissionRow
                  key={permission.id}
                  nl={nl}
                  clientId={clientId}
                  permission={permission}
                  grants={grants}
                  roles={roles}
                  groups={groups}
                />
              ))}
            </ul>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">
                {nl ? 'Nieuwe permissie' : 'New permission'}
              </summary>
              <SaveForm
                action={createPermissionAction}
                submitLabel={nl ? 'Toevoegen' : 'Add'}
                savingLabel={nl ? 'Toevoegen…' : 'Adding…'}
                savedMessage={nl ? 'Permissie toegevoegd' : 'Permission added'}
                fallbackErrorMessage={nl ? 'Toevoegen mislukt' : 'Could not add'}
                errorMessages={errorMessages}
                className="mt-3 space-y-3"
              >
                <input type="hidden" name="clientId" value={clientId} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5c667f]">{nl ? 'Code' : 'Code'}</label>
                  <Input name="code" placeholder={`${permissionNamespace}.read`} autoComplete="off" required />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#5c667f]">Label (NL)</label>
                    <Input name="labelNl" required />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#5c667f]">Label (EN)</label>
                    <Input name="labelEn" required />
                  </div>
                </div>
              </SaveForm>
            </details>
          </>
        )}
      </section>
    </>
  );
}

function PermissionRow({
  nl,
  clientId,
  permission,
  grants,
  roles,
  groups,
}: {
  nl: boolean;
  clientId: string;
  permission: Permission;
  grants: Grants;
  roles: Named[];
  groups: Named[];
}) {
  const userGrants = grants.users.filter((g) => g.permissionId === permission.id);
  const roleGrants = grants.roles.filter((g) => g.permissionId === permission.id);
  const groupGrants = grants.groups.filter((g) => g.permissionId === permission.id);
  const nameOf = (list: Named[], id: string) => list.find((item) => item.id === id)?.name ?? id;

  return (
    <li className="rounded-xl border border-zinc-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-sm font-medium">{permission.code}</code>
        {permission.system && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
            {nl ? 'verleent toegang' : 'grants access'}
          </span>
        )}
        {permission.deprecated && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
            {nl ? 'afgevoerd' : 'deprecated'}
          </span>
        )}
        <span className="text-sm text-zinc-500">{nl ? permission.labelNl : permission.labelEn}</span>

        <span className="ml-auto">
          <DeleteIconButton
            action={deletePermissionAction}
            fields={{ clientId, permissionId: permission.id }}
            label={nl ? 'Verwijderen' : 'Delete'}
            srLabel={`${nl ? 'Verwijderen' : 'Delete'}: ${permission.code}`}
            title={nl ? 'Permissie verwijderen?' : 'Delete permission?'}
            description={
              nl
                ? `${permission.code} verdwijnt, samen met ${userGrants.length + roleGrants.length + groupGrants.length} toekenning(en). De lopende tokens van deze applicatie worden ingetrokken, zodat het recht niet blijft doorwerken.`
                : `${permission.code} disappears, along with ${userGrants.length + roleGrants.length + groupGrants.length} grant(s). This application's current tokens are revoked so the right does not keep working.`
            }
            confirmLabel={nl ? 'Verwijderen' : 'Delete'}
            cancelLabel={nl ? 'Annuleren' : 'Cancel'}
            successMessage={nl ? 'Permissie verwijderd' : 'Permission deleted'}
          />
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {roleGrants.map((grant) => (
          <GrantChip
            key={grant.id}
            nl={nl}
            clientId={clientId}
            grantId={grant.id}
            kind="role"
            label={`${nl ? 'rol' : 'role'}: ${nameOf(roles, grant.roleId)}`}
          />
        ))}
        {groupGrants.map((grant) => (
          <GrantChip
            key={grant.id}
            nl={nl}
            clientId={clientId}
            grantId={grant.id}
            kind="group"
            label={`${nl ? 'post' : 'post'}: ${nameOf(groups, grant.groupId)}${grant.kind === 'LEADER' ? ' (lead)' : ''}`}
          />
        ))}
        {userGrants.map((grant) => (
          <GrantChip
            key={grant.id}
            nl={nl}
            clientId={clientId}
            grantId={grant.id}
            kind="user"
            label={grant.userName}
          />
        ))}
        {userGrants.length + roleGrants.length + groupGrants.length === 0 && (
          <span className="text-xs text-zinc-500">
            {nl ? 'Nog aan niemand toegekend.' : 'Not granted to anyone yet.'}
          </span>
        )}
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-zinc-500">{nl ? 'Toekennen' : 'Grant'}</summary>
        <div className="mt-2 space-y-2">
          <form action={grantPermissionAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="permissionId" value={permission.id} />
            <input type="hidden" name="kind" value="role" />
            <label className="text-xs text-[#5c667f]">
              {nl ? 'Via VTK-rol' : 'Through VTK role'}
              <select name="roleId" className="mt-1 block rounded-lg border border-zinc-300 px-2 py-1 text-sm">
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="secondary">
              {nl ? 'Toekennen' : 'Grant'}
            </Button>
          </form>

          <form action={grantPermissionAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="permissionId" value={permission.id} />
            <input type="hidden" name="kind" value="group" />
            <label className="text-xs text-[#5c667f]">
              {nl ? 'Via post' : 'Through post'}
              <select name="groupId" className="mt-1 block rounded-lg border border-zinc-300 px-2 py-1 text-sm">
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[#5c667f]">
              {nl ? 'Wie' : 'Who'}
              <select name="grantKind" className="mt-1 block rounded-lg border border-zinc-300 px-2 py-1 text-sm">
                <option value="DEFAULT">{nl ? 'elk lid van de post' : 'every member of the post'}</option>
                <option value="LEADER">{nl ? 'enkel de verantwoordelijke' : 'only the lead'}</option>
              </select>
            </label>
            <Button type="submit" variant="secondary">
              {nl ? 'Toekennen' : 'Grant'}
            </Button>
          </form>

          <GrantToUserForm nl={nl} clientId={clientId} permissionId={permission.id} />
        </div>
      </details>
    </li>
  );
}

function GrantChip({
  nl,
  clientId,
  grantId,
  kind,
  label,
}: {
  nl: boolean;
  clientId: string;
  grantId: string;
  kind: 'user' | 'role' | 'group';
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs">
      {label}
      <DeleteIconButton
        action={revokePermissionAction}
        fields={{ clientId, grantId, kind }}
        label={nl ? 'Intrekken' : 'Revoke'}
        srLabel={`${nl ? 'Intrekken' : 'Revoke'}: ${label}`}
        title={nl ? 'Toekenning intrekken?' : 'Revoke grant?'}
        description={
          kind === 'user'
            ? nl
              ? 'De tokens van dit lid voor deze applicatie worden ingetrokken. Een al uitgedeeld access token blijft geldig tot het vervalt (max. 10 minuten).'
              : "This member's tokens for this application are revoked. An access token already handed out stays valid until it expires (max. 10 minutes)."
            : nl
              ? 'Welke leden dit raakt is niet vooraf te bepalen, dus worden de lopende tokens van de hele applicatie ingetrokken. Iedereen moet opnieuw aanmelden.'
              : 'Which members this affects cannot be determined up front, so all current tokens for this application are revoked. Everyone has to sign in again.'
        }
        confirmLabel={nl ? 'Intrekken' : 'Revoke'}
        cancelLabel={nl ? 'Annuleren' : 'Cancel'}
        successMessage={nl ? 'Toekenning ingetrokken' : 'Grant revoked'}
      />
    </span>
  );
}

/** Zelfde patroon als AddRoleMemberForm in admin/roles: server-side zoeken, nooit alle leden laden. */
function GrantToUserForm({ nl, clientId, permissionId }: { nl: boolean; clientId: string; permissionId: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (selected || q.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
        if (resp.ok) {
          setResults(await resp.json());
          setOpen(true);
        }
      } catch {
        /* stille fout: gebruiker kan opnieuw typen */
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selected]);

  function reset() {
    setSelected(null);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  return (
    <form
      action={grantPermissionAction}
      onSubmit={() => setTimeout(reset, 0)}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="permissionId" value={permissionId} />
      <input type="hidden" name="kind" value="user" />
      <input type="hidden" name="userId" value={selected?.id ?? ''} />

      <div className="relative min-w-[220px]">
        <label className="mb-1 block text-xs font-medium text-[#5c667f]">
          {nl ? 'Rechtstreeks aan een lid' : 'Directly to a member'}
        </label>
        <Input
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            if (selected) setSelected(null);
            if (value.trim().length < 2) {
              setResults([]);
              setOpen(false);
            }
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={nl ? 'Naam, e-mail of r-nummer' : 'Name, email or r-number'}
          autoComplete="off"
        />
        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
            {results.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(user);
                    setQuery(user.name);
                    setOpen(false);
                  }}
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-zinc-50"
                >
                  <span className="font-medium">{user.name}</span>
                  <span className="text-xs text-zinc-500">{user.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="text-xs text-[#5c667f]">
        {nl ? 'Vervalt op (optioneel)' : 'Expires on (optional)'}
        <input
          type="date"
          name="expiresAt"
          className="mt-1 block rounded-lg border border-zinc-300 px-2 py-1 text-sm"
        />
      </label>

      <Button type="submit" variant="secondary" disabled={!selected}>
        {nl ? 'Toekennen' : 'Grant'}
      </Button>
    </form>
  );
}
