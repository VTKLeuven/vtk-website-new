import { ActionForm } from '@/components/ui/unsentGuard';
import { prisma } from '@vtk/db';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/locale';
import { sortRolesByName } from '@/lib/roleOrder';
import { requirePermission } from '@/lib/session';
import { getDictionary, type Locale } from '@vtk/i18n';
import { nameParts } from '@vtk/auth';
import { publicUrl } from '@/lib/storage';
import { AvatarCropField } from '@/components/profile/AvatarCropField';
import {
  removeUserAvatarAction,
  updateUserAvatarAction,
} from '@/app/actions/users-groups';
import { userAvatarErrorMessages } from '../messages';
import { Button, Card, Input, Label, Select } from '@vtk/ui';
import { DeleteButton, DeleteIconButton } from '@/components/ui/DeleteIconButton';
import { SaveForm } from '@/components/ui/SaveForm';
import { userErrorMessages } from '../messages';
import {
  addMembershipFormAction,
  deleteUserAction,
  removeMembershipAction,
  saveUserAction,
  sendUserAccessLinkAction,
  unlinkKulLoginAction,
} from '@/app/actions/users-groups';
import { assignUserRoleAction, removeUserRoleAction } from '@/app/actions/roles';
import { currentWorkingYear, formatWorkingYear } from '@/lib/workingYear';
import { isKuLeuvenEmail } from '@/lib/accountAccess';

export default async function EditUserPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const session = await requirePermission('users.edit');
  const dict = getDictionary(locale);
  const year = currentWorkingYear();
  // Rollen toewijzen is een aparte, gevoeligere bevoegdheid dan gebruikersbeheer.
  const canManageRoles = session.user.isSuperAdmin || session.permissions.includes('roles.manage');

  const [user, groups, allRoles] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        memberships: { include: { group: true } },
        roles: { where: { year }, include: { role: true } },
        accounts: {
          where: { providerId: { in: ['credential', 'kuleuven'] } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, providerId: true, accountId: true, createdAt: true },
        },
        // De richtingen per academiejaar, zoals het lid ze bevestigde.
        studyConfirmations: {
          orderBy: { year: 'desc' },
          select: { year: true, studyYears: true, studyProgrammes: true, confirmedAt: true },
        },
      },
    }),
    prisma.group.findMany({ orderBy: { orderInPraesidium: 'asc' } }),
    canManageRoles ? prisma.role.findMany() : Promise.resolve([]),
  ]);
  if (!user) notFound();

  // Rollen die dit lid dit jaar nog niet heeft, om in de dropdown aan te bieden.
  const assignedRoleIds = new Set(user.roles.map((ur) => ur.roleId));
  const assignableRoles = sortRolesByName(allRoles, locale).filter((r) => !assignedRoleIds.has(r.id));

  // Leden van voor de eerste onboarding hebben nog geen aparte voor-/achternaam;
  // dan tonen we een split van de weergavenaam als startwaarde.
  const parts = nameParts(user);
  const accessEmail = user.personalEmail || (!isKuLeuvenEmail(user.email) ? user.email : '');
  const hasPassword = user.accounts.some((account) => account.providerId === 'credential');
  const kulLogins = user.accounts.filter((account) => account.providerId === 'kuleuven');
  const linkedOnFmt = new Intl.DateTimeFormat(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    timeZone: 'Europe/Brussels',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const accessErrors = {
    ...userErrorMessages(locale),
    NO_PERSONAL_EMAIL:
      locale === 'nl'
        ? 'Vul een geldig privéadres in dat niet van KU Leuven is.'
        : 'Enter a valid private address that is not managed by KU Leuven.',
    ACCOUNT_NOT_FOUND:
      locale === 'nl'
        ? 'Dit account is niet actief of bestaat niet meer.'
        : 'This account is inactive or no longer exists.',
    FORBIDDEN:
      locale === 'nl'
        ? 'Alleen een superadmin kan een toegangslink voor een superadmin sturen.'
        : 'Only a super admin can send an access link for another super admin.',
    MAIL_FAILED:
      locale === 'nl'
        ? 'Het privéadres is bewaard, maar de mail kon niet worden verstuurd.'
        : 'The private address was saved, but the email could not be sent.',
  };

  const nl = locale === 'nl';
  const formatAddress = (a: {
    street: string | null;
    houseNumber: string | null;
    bus: string | null;
    postalCode: string | null;
    city: string | null;
  }) => {
    const line1 = [a.street, a.houseNumber].filter(Boolean).join(' ') + (a.bus ? ` ${nl ? 'bus' : 'box'} ${a.bus}` : '');
    const line2 = [a.postalCode, a.city].filter(Boolean).join(' ');
    return [line1.trim(), line2].filter(Boolean).join(', ') || null;
  };
  const kotAddress = formatAddress(user);
  const homeAddress = formatAddress({
    street: user.homeStreet,
    houseNumber: user.homeHouseNumber,
    bus: user.homeBus,
    postalCode: user.homePostalCode,
    city: user.homeCity,
  });
  const studyLabel = (years: string[], programmes: string[]) => ({
    years: years.map((y) => dict.onboarding.years[y as keyof typeof dict.onboarding.years] ?? y).join(', '),
    programmes: programmes
      .map((p) => dict.onboarding.programmes[p as keyof typeof dict.onboarding.programmes] ?? p)
      .join(', '),
  });
  const currentStudy = studyLabel(user.studyYears, user.studyProgrammes);
  const notFilled = nl ? 'Niet ingevuld' : 'Not filled in';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{user.name}</h1>
      <Card className="p-5">
        <SaveForm
          action={saveUserAction}
          className="grid grid-cols-1 md:grid-cols-2 gap-3 [&>button]:justify-self-start"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={dict.common.saved}
          errorMessages={userErrorMessages(locale)}
          fallbackErrorMessage={dict.common.saveError}
        >
          <input type="hidden" name="id" value={user.id} />
          <div>
            <Label>{locale === 'nl' ? 'Voornaam' : 'First name'}</Label>
            <Input name="firstName" defaultValue={parts.firstName} required />
          </div>
          <div>
            <Label>{locale === 'nl' ? 'Achternaam' : 'Last name'}</Label>
            <Input name="lastName" defaultValue={parts.lastName} required />
          </div>
          <div>
            <Label>Email</Label>
            <Input name="email" type="email" defaultValue={user.email} required />
          </div>
          <div>
            <Label>{locale === 'nl' ? 'R-nummer' : 'R-number'}</Label>
            <Input name="rNumber" defaultValue={user.rNumber ?? ''} placeholder="r0123456" />
          </div>
          <div>
            <Label>{locale === 'nl' ? 'Gsm-nummer' : 'Mobile number'}</Label>
            <Input
              name="phone"
              type="tel"
              defaultValue={user.phone ?? ''}
              placeholder="+32 470 12 34 56"
            />
          </div>
          <div>
            <Label>{locale === 'nl' ? 'Nieuw wachtwoord' : 'New password'}</Label>
            <Input
              name="password"
              type="text"
              minLength={8}
              placeholder={locale === 'nl' ? 'Leeg laten om niet te wijzigen' : 'Leave blank to keep'}
            />
          </div>
          <div>
            <Label>Locale</Label>
            <Select name="locale" defaultValue={user.locale}>
              <option value="NL">NL</option>
              <option value="EN">EN</option>
            </Select>
          </div>
          <div className="md:col-span-2 flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={user.active} />
              Active
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="isSuperAdmin" defaultChecked={user.isSuperAdmin} />
              Superadmin
            </label>
          </div>
          {/* Erelid wordt beheerd op /admin/leden (lijst Ereleden); hier
              staat het enkel ter info, zodat je het niet moet gaan zoeken. */}
          {user.honoraryMember ? (
            <p className="md:col-span-2 -mt-1 text-xs text-[#5c667f]">
              {locale === 'nl'
                ? 'Erelid. Beheer dit onder Ledenbeheer > Leden > Ereleden.'
                : 'Honorary member. Manage this under Members > Honorary members.'}
            </p>
          ) : null}
        </SaveForm>
      </Card>

      {/* Wat het lid zelf invulde in de onboarding, de studiebevestiging en op
          /account. Enkel ter info: het lid past dit zelf aan. */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">{nl ? 'Adressen en studie' : 'Addresses and studies'}</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[#5c667f]">{nl ? 'Kotadres' : 'Student address'}</dt>
            <dd className="mt-0.5 text-vtk-ink">
              {user.noKot ? (nl ? 'Geen kot' : 'No student room') : (kotAddress ?? <span className="text-[#5c667f]">{notFilled}</span>)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[#5c667f]">{nl ? 'Thuisadres' : 'Home address'}</dt>
            <dd className="mt-0.5 text-vtk-ink">{homeAddress ?? <span className="text-[#5c667f]">{notFilled}</span>}</dd>
          </div>
        </dl>

        <div>
          <h3 className="text-sm font-medium text-vtk-ink">{nl ? 'Studierichtingen per academiejaar' : 'Study programmes per academic year'}</h3>
          <div className="relative mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-[#5c667f]">
                  <th className="py-2 pr-4 font-medium">{nl ? 'Academiejaar' : 'Academic year'}</th>
                  <th className="py-2 pr-4 font-medium">{nl ? 'Studiejaar' : 'Year of study'}</th>
                  <th className="py-2 font-medium">{nl ? 'Richtingen' : 'Programmes'}</th>
                </tr>
              </thead>
              <tbody>
                {/* Het profiel zoals het nu staat; een bevestiging van dit jaar staat eronder apart. */}
                <tr className="border-b border-vtk-blue/10">
                  <td className="py-2 pr-4 text-[#5c667f]">{nl ? 'Nu op het profiel' : 'Current profile'}</td>
                  <td className="py-2 pr-4">{currentStudy.years || '—'}</td>
                  <td className="py-2">
                    {currentStudy.programmes || '—'}
                    {user.notAtFaculty ? (
                      <span className="block text-xs text-[#5c667f]">{nl ? 'Studeert niet aan de faculteit' : 'Not studying at the faculty'}</span>
                    ) : null}
                  </td>
                </tr>
                {user.studyConfirmations.map((row) => {
                  const label = studyLabel(row.studyYears, row.studyProgrammes);
                  return (
                    <tr key={row.year} className="border-b border-vtk-blue/10 last:border-0">
                      <td className="py-2 pr-4 tabular-nums">{formatWorkingYear(row.year)}</td>
                      <td className="py-2 pr-4">{label.years || '—'}</td>
                      <td className="py-2">{label.programmes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[#5c667f]">
            {user.studyConfirmations.length === 0
              ? nl
                ? 'Nog geen bevestigde studie bewaard. De historiek per jaar bestaat sinds 22 september 2026; daarvoor bleef enkel het huidige profiel.'
                : 'No confirmed studies stored yet. The history per year exists since 22 September 2026; before that only the current profile was kept.'
              : nl
                ? 'Per jaar zoals bevestigd in de onboarding of de jaarlijkse studiebevestiging. De historiek bestaat sinds 22 september 2026.'
                : 'Per year as confirmed in the onboarding or the yearly study confirmation. The history exists since 22 September 2026.'}
          </p>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">{locale === 'nl' ? 'Profielfoto' : 'Profile photo'}</h2>
        <p className="max-w-2xl text-sm leading-6 text-[#5c667f]">
          {locale === 'nl'
            ? 'Vervang de foto van dit lid, bvb wanneer een ongepaste foto werd gebruikt. De nieuwe foto wordt vierkatisch bijgesneden en opgeslagen; de oude wordt verwijderd.'
            : 'Replace this member\'s photo, e.g. when an inappropriate one was used. The new photo is cropped to a square and stored; the old one is removed.'}
        </p>
        <SaveForm
          action={updateUserAvatarAction}
          className="grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr]"
          submitLabel={locale === 'nl' ? 'Nieuwe foto opslaan' : 'Save new photo'}
          savingLabel={locale === 'nl' ? 'Opslaan...' : 'Saving...'}
          savedMessage={locale === 'nl' ? 'Profielfoto bijgewerkt' : 'Profile photo updated'}
          errorMessages={userAvatarErrorMessages(locale)}
          fallbackErrorMessage={dict.common.saveError}
        >
          <input type="hidden" name="id" value={user.id} />
          <AvatarCropField locale={locale} currentAvatar={publicUrl(user.avatarKey)} />
        </SaveForm>
        {user.avatarKey ? (
          <DeleteButton
            action={removeUserAvatarAction}
            fields={{ id: user.id }}
            title={locale === 'nl' ? 'Profielfoto verwijderen?' : 'Remove profile photo?'}
            description={
              locale === 'nl'
                ? `De profielfoto van ${user.name} wordt verwijderd. Dit kan niet ongedaan gemaakt worden.`
                : `The profile photo of ${user.name} will be removed. This cannot be undone.`
            }
            confirmLabel={locale === 'nl' ? 'Verwijderen' : 'Remove'}
            cancelLabel={locale === 'nl' ? 'Annuleren' : 'Cancel'}
            successMessage={locale === 'nl' ? 'Profielfoto verwijderd' : 'Profile photo removed'}
            errorMessages={userAvatarErrorMessages(locale)}
            errorFallback={dict.common.saveError}
          >
            {locale === 'nl' ? 'Foto verwijderen' : 'Remove photo'}
          </DeleteButton>
        ) : null}
      </Card>

      <Card className="p-5 space-y-4">
        <div>
          <h2 className="font-semibold">{locale === 'nl' ? 'Toegang na KU Leuven' : 'Access after KU Leuven'}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5c667f]">
            {locale === 'nl'
              ? 'Vul een privéadres in en stuur een eenmalige veilige link. Daarmee kan de gebruiker een wachtwoord instellen of herstellen en ook zonder KU Leuven-account blijven inloggen.'
              : 'Enter a private address and send a one-time secure link. The user can set or reset a password and keep signing in without a KU Leuven account.'}
          </p>
        </div>
        <SaveForm
          action={sendUserAccessLinkAction}
          className="grid max-w-2xl grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
          submitLabel={
            hasPassword
              ? locale === 'nl'
                ? 'Herstellink sturen'
                : 'Send reset link'
              : locale === 'nl'
                ? 'Toegangslink sturen'
                : 'Send access link'
          }
          savingLabel={locale === 'nl' ? 'Versturen...' : 'Sending...'}
          savedMessage={locale === 'nl' ? 'Veilige link verstuurd' : 'Secure link sent'}
          errorMessages={accessErrors}
          fallbackErrorMessage={
            locale === 'nl' ? 'De veilige link kon niet worden verstuurd.' : 'The secure link could not be sent.'
          }
          resetOnSuccess={false}
          submitDisabled={!user.active}
        >
          <input type="hidden" name="id" value={user.id} />
          <div>
            <Label>{locale === 'nl' ? 'Privé-e-mailadres' : 'Private email address'}</Label>
            <Input name="email" type="email" defaultValue={accessEmail} placeholder="naam@example.com" required />
          </div>
        </SaveForm>
        {!user.active ? (
          <p className="text-xs text-[#5c667f]">
            {locale === 'nl'
              ? 'Activeer dit account eerst om een toegangslink te sturen.'
              : 'Activate this account before sending an access link.'}
          </p>
        ) : null}
      </Card>

      {/* Een doctoraatsstudent heeft een r- en een u-nummer. Logde hij met allebei
          in voor ze gekoppeld waren, dan hangt het tweede aan een tweede
          account; pas na loskoppelen kan hij het op /account aan het zijne
          hangen. */}
      <Card className="p-5 space-y-3">
        <div>
          <h2 className="font-semibold">{locale === 'nl' ? 'KU Leuven-logins' : 'KU Leuven logins'}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5c667f]">
            {locale === 'nl'
              ? 'Hangt een r- of u-nummer aan het verkeerde account, koppel het hier los. Het lid koppelt het daarna zelf aan het juiste account, onder Mijn gegevens op /account.'
              : 'If an r- or u-number sits on the wrong account, unlink it here. The member then links it to the right account under My details on /account.'}
          </p>
        </div>
        <ul className="divide-y divide-zinc-200">
          {kulLogins.map((login) => {
            const name = login.accountId.split('@')[0] || login.accountId;
            return (
              <li key={login.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm">
                  <span className="font-medium">{name}</span>
                  {' · '}
                  {locale === 'nl' ? 'gekoppeld op ' : 'linked on '}
                  {linkedOnFmt.format(login.createdAt)}
                </span>
                <DeleteIconButton
                  action={unlinkKulLoginAction}
                  fields={{ id: login.id, userId: user.id }}
                  label={locale === 'nl' ? 'Loskoppelen' : 'Unlink'}
                  srLabel={`${locale === 'nl' ? 'Loskoppelen' : 'Unlink'}: ${name}`}
                  title={locale === 'nl' ? 'KU Leuven-login loskoppelen?' : 'Unlink KU Leuven login?'}
                  description={
                    locale === 'nl'
                      ? `${name} hangt daarna niet meer aan het account van ${user.name}. Een volgende login met ${name} komt op het account met hetzelfde adres of r-nummer terecht, of maakt een nieuw account. Het account van ${user.name} zelf, met zijn lidmaatschappen, tickets en historiek, blijft staan.${kulLogins.length === 1 && !hasPassword ? ' Dit is de enige manier waarop dit account kan inloggen.' : ''}`
                      : `${name} will no longer belong to the account of ${user.name}. A next sign-in with ${name} lands on the account with the same address or r-number, or creates a new account. The account of ${user.name} itself, with its memberships, tickets and history, stays.${kulLogins.length === 1 && !hasPassword ? ' This is the only way this account can sign in.' : ''}`
                  }
                  confirmLabel={locale === 'nl' ? 'Loskoppelen' : 'Unlink'}
                  cancelLabel={locale === 'nl' ? 'Annuleren' : 'Cancel'}
                  successMessage={locale === 'nl' ? 'KU Leuven-login losgekoppeld' : 'KU Leuven login unlinked'}
                  errorMessages={{
                    NOT_FOUND:
                      locale === 'nl'
                        ? 'Niet losgekoppeld: deze login hangt niet (meer) aan dit account.'
                        : 'Not unlinked: this login is not (or no longer) on this account.',
                  }}
                  errorFallback={dict.common.saveError}
                />
              </li>
            );
          })}
          {kulLogins.length === 0 && (
            <li className="py-2 text-sm text-zinc-500">
              {locale === 'nl'
                ? 'Dit account heeft geen KU Leuven-login.'
                : 'This account has no KU Leuven login.'}
            </li>
          )}
        </ul>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">{locale === 'nl' ? 'Post lidmaatschappen' : 'Post Memberships'}</h2>
        <ul className="divide-y divide-zinc-200">
          {user.memberships.map((m) => (
            <li key={m.id} className="py-2 flex items-center justify-between gap-3">
              <span className="text-sm">
                <span className="font-medium">{m.group.nameNl}</span> · {m.role}
                {m.titleNl ? ` · ${m.titleNl}` : ''}
                {m.year ? ` · ${m.year}` : ''}
              </span>
              <DeleteIconButton
                action={removeMembershipAction}
                fields={{ id: m.id, userId: user.id }}
                label={locale === 'nl' ? 'Verwijderen' : 'Remove'}
                srLabel={`${locale === 'nl' ? 'Verwijderen' : 'Remove'}: ${m.group.nameNl}`}
                title={locale === 'nl' ? 'Lidmaatschap verwijderen?' : 'Remove membership?'}
                description={
                  locale === 'nl'
                    ? `${user.name} wordt verwijderd uit ${m.group.nameNl}${m.year ? ` (${m.year})` : ''}. Rechten die via deze post kwamen, vervallen daarmee.`
                    : `${user.name} will be removed from ${m.group.nameNl}${m.year ? ` (${m.year})` : ''}. Permissions granted through this group will be lost.`
                }
                confirmLabel={locale === 'nl' ? 'Verwijderen' : 'Remove'}
                cancelLabel={locale === 'nl' ? 'Annuleren' : 'Cancel'}
                successMessage={locale === 'nl' ? 'Lidmaatschap verwijderd' : 'Membership removed'}
              />
            </li>
          ))}
          {user.memberships.length === 0 && (
            <li className="py-2 text-sm text-zinc-500">
              {locale === 'nl'
                ? 'Deze gebruiker zit in geen enkele post of werkgroep.'
                : 'This user is not in any post or working group.'}
            </li>
          )}
        </ul>
        <ActionForm action={addMembershipFormAction} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <input type="hidden" name="userId" value={user.id} />
          <div className="md:col-span-2">
            <Label>Group</Label>
            <Select name="groupId" required defaultValue="">
              <option value="" disabled>
                {locale === 'nl' ? 'Kies een post of werkgroep' : 'Choose a post or working group'}
              </option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nameNl}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Role</Label>
            <Select name="role" defaultValue="MEMBER">
              <option value="MEMBER">Member</option>
              <option value="LEAD">Lead</option>
            </Select>
          </div>
          <div>
            <Label>Title (NL)</Label>
            <Input name="titleNl" />
          </div>
          <div>
            <Label>{locale === 'nl' ? 'Werkingsjaar' : 'Working year'}</Label>
            <Input name="year" type="number" defaultValue={currentWorkingYear()} />
          </div>
          <div>
            <Button type="submit">{locale === 'nl' ? 'Toevoegen' : 'Add'}</Button>
          </div>
        </ActionForm>
      </Card>

      {canManageRoles && (
        <Card className="p-5 space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">{locale === 'nl' ? 'Rollen' : 'Roles'}</h2>
            <span className="text-xs text-[#5c667f]">{formatWorkingYear(year)}</span>
          </div>
          <p className="text-sm text-[#5c667f]">
            {locale === 'nl'
              ? 'Direct toegewezen rollen voor dit werkingsjaar. Rollen die via een post komen, staan hierboven bij de lidmaatschappen.'
              : 'Roles assigned directly for this working year. Roles that come through a post are shown above under memberships.'}
          </p>
          <ul className="divide-y divide-zinc-200">
            {user.roles.map((ur) => (
              <li key={ur.roleId} className="py-2 flex items-center justify-between gap-3">
                <span className="text-sm">
                  <span className="font-medium">{locale === 'nl' ? ur.role.nameNl : ur.role.nameEn}</span>
                  {' · '}
                  <code className="text-xs text-[#5c667f]">{ur.role.code}</code>
                </span>
                <DeleteIconButton
                  action={removeUserRoleAction}
                  fields={{ userId: user.id, roleId: ur.roleId, year: String(year) }}
                  label={locale === 'nl' ? 'Rol intrekken' : 'Remove role'}
                  srLabel={`${locale === 'nl' ? 'Rol intrekken' : 'Remove role'}: ${locale === 'nl' ? ur.role.nameNl : ur.role.nameEn}`}
                  title={locale === 'nl' ? 'Rol intrekken?' : 'Remove role?'}
                  description={
                    locale === 'nl'
                      ? `${user.name} verliest de rol "${ur.role.nameNl}" voor ${formatWorkingYear(year)} en de rechten die enkel via deze rol kwamen.`
                      : `${user.name} loses the role "${ur.role.nameEn}" for ${formatWorkingYear(year)} and the permissions that came only through this role.`
                  }
                  confirmLabel={locale === 'nl' ? 'Intrekken' : 'Remove'}
                  cancelLabel={locale === 'nl' ? 'Annuleren' : 'Cancel'}
                  successMessage={locale === 'nl' ? 'Rol ingetrokken' : 'Role removed'}
                />
              </li>
            ))}
            {user.roles.length === 0 && (
              <li className="py-2 text-sm text-zinc-500">
                {locale === 'nl'
                  ? 'Geen rechtstreeks toegewezen rollen voor dit werkingsjaar.'
                  : 'No directly assigned roles for this working year.'}
              </li>
            )}
          </ul>
          {assignableRoles.length > 0 && (
            <ActionForm action={assignUserRoleAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="userId" value={user.id} />
              <div className="min-w-[220px] flex-1">
                <Label>{locale === 'nl' ? 'Rol toevoegen' : 'Add role'}</Label>
                <Select name="roleId" required defaultValue="">
                  <option value="" disabled>
                    {locale === 'nl' ? 'Kies een rol' : 'Choose a role'}
                  </option>
                  {assignableRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {locale === 'nl' ? r.nameNl : r.nameEn}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit">{locale === 'nl' ? 'Toevoegen' : 'Add'}</Button>
            </ActionForm>
          )}
        </Card>
      )}

      <DeleteButton
        action={deleteUserAction}
        fields={{ id: user.id }}
        title={locale === 'nl' ? 'Gebruiker verwijderen?' : 'Delete user?'}
        description={
          locale === 'nl'
            ? `Het account van ${user.name} (${user.email}) wordt permanent verwijderd, samen met ${user.memberships.length} lidmaatschap(pen). Dit kan niet ongedaan gemaakt worden. Overweeg het account op inactief te zetten als je de historiek wil bewaren.`
            : `The account of ${user.name} (${user.email}) will be permanently deleted, along with ${user.memberships.length} membership(s). This cannot be undone. Consider deactivating the account instead if you want to keep the history.`
        }
        confirmLabel={locale === 'nl' ? 'Verwijderen' : 'Delete'}
        cancelLabel={locale === 'nl' ? 'Annuleren' : 'Cancel'}
        errorMessages={userErrorMessages(locale)}
        errorFallback={
          locale === 'nl'
            ? 'Niet verwijderd. Probeer het opnieuw; blijft het misgaan, mail dan naar it@vtk.be.'
            : 'Not deleted. Try again; if it keeps failing, email it@vtk.be.'
        }
        // Geen toast bij succes: deze action redirect naar de gebruikerslijst,
        // want deze pagina bestaat nadien niet meer. Die navigatie is de
        // bevestiging. Een mislukking redirect niet en heeft dus wel een melding
        // nodig, anders lijkt de knop niets te doen.
      >
        {locale === 'nl' ? 'Gebruiker verwijderen' : 'Delete user'}
      </DeleteButton>
    </div>
  );
}
