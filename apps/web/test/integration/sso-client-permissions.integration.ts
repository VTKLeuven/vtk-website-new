import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@vtk/db';
import { checkClientAccess, effectiveClientPermissions, resolveClaims } from '@vtk/auth/server';
import { currentWorkingYear } from '@vtk/auth';

/**
 * De toegangspoort en de permissieresolver tegen een echte database. Hier zit
 * het risico dat unit tests niet dekken: de drie toekenningspaden, de
 * jaargrens, en de LEADER-regel.
 */
describe('client permissions', () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    user: randomUUID(),
    other: randomUUID(),
    group: randomUUID(),
    role: randomUUID(),
  };
  const clientId = `perm-test-${suffix}`;
  const namespace = `wiki${suffix.replace(/[^a-z0-9]/g, '')}`;
  const year = currentWorkingYear();

  /** Ingevuld in beforeAll; per code de id van de permissierij. */
  const permissionIds: Record<string, string> = {};

  async function definePermission(code: string) {
    const row = await prisma.ssoClientPermission.create({
      data: { clientId, code, labelNl: code, labelEn: code },
    });
    permissionIds[code] = row.id;
    return row.id;
  }

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: ids.user,
          name: 'Jan Janssens',
          email: `perm-${ids.user}@student.kuleuven.be`,
          emailVerified: true,
          active: true,
        },
        {
          id: ids.other,
          name: 'Mies Peeters',
          email: `perm-${ids.other}@student.kuleuven.be`,
          emailVerified: true,
          active: true,
        },
      ],
    });

    await prisma.oauthClient.create({
      data: {
        id: clientId,
        clientId,
        name: 'Permissietest',
        redirectUris: ['https://example.vtk.be/cb'],
        scopes: ['openid', 'entitlements'],
        accessMode: 'OPEN',
        permissionNamespace: namespace,
      },
    });

    await prisma.group.create({
      data: { id: ids.group, code: `perm-${suffix}`, slug: `perm-${suffix}`, nameNl: 'Test', nameEn: 'Test' },
    });
    await prisma.role.create({
      data: { id: ids.role, code: `perm-role-${suffix}`, nameNl: 'Testrol', nameEn: 'Test role' },
    });

    await definePermission(`${namespace}.access`);
    await definePermission(`${namespace}.read`);
    await definePermission(`${namespace}.edit`);
    await definePermission(`${namespace}.lead`);
    await definePermission(`${namespace}.old`);
  });

  afterAll(async () => {
    // De grants hangen met cascade aan de permissies, die aan de client hangen.
    await prisma.oauthClient.deleteMany({ where: { clientId } });
    await prisma.groupMembership.deleteMany({ where: { groupId: ids.group } });
    await prisma.userRole.deleteMany({ where: { roleId: ids.role } });
    await prisma.group.deleteMany({ where: { id: ids.group } });
    await prisma.role.deleteMany({ where: { id: ids.role } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.user, ids.other] } } });
  });

  it('gives an ungranted member nothing', async () => {
    expect(await effectiveClientPermissions(ids.user, clientId)).toEqual([]);
  });

  it('resolves a direct grant', async () => {
    await prisma.ssoUserClientPermission.create({
      data: { permissionId: permissionIds[`${namespace}.read`], clientId, userId: ids.user },
    });
    expect(await effectiveClientPermissions(ids.user, clientId)).toEqual([`${namespace}.read`]);
  });

  it('ignores an expired direct grant', async () => {
    await prisma.ssoUserClientPermission.create({
      data: {
        permissionId: permissionIds[`${namespace}.old`],
        clientId,
        userId: ids.user,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    expect(await effectiveClientPermissions(ids.user, clientId)).not.toContain(`${namespace}.old`);
  });

  it('resolves a grant through a VTK role, scoped to the working year', async () => {
    await prisma.ssoRoleClientPermission.create({
      data: { permissionId: permissionIds[`${namespace}.edit`], clientId, roleId: ids.role },
    });

    // Rol toegekend voor een ander werkingsjaar: telt niet mee.
    await prisma.userRole.create({ data: { userId: ids.user, roleId: ids.role, year: year - 1 } });
    expect(await effectiveClientPermissions(ids.user, clientId)).not.toContain(`${namespace}.edit`);

    await prisma.userRole.create({ data: { userId: ids.user, roleId: ids.role, year } });
    expect(await effectiveClientPermissions(ids.user, clientId)).toContain(`${namespace}.edit`);
  });

  // Toekennen via een post kan sinds september 2026 niet meer vanuit het beheer;
  // rijen die er al stonden blijven wel gelden, en dat is wat deze test bewaakt.
  // De rij wordt daarom rechtstreeks geschreven en niet via grantClientPermission.
  it('applies LEADER grants only to the lead of a post', async () => {
    await prisma.ssoGroupClientPermission.create({
      data: { permissionId: permissionIds[`${namespace}.lead`], clientId, groupId: ids.group, kind: 'LEADER' },
    });
    await prisma.groupMembership.create({
      data: { userId: ids.user, groupId: ids.group, year, role: 'MEMBER' },
    });
    expect(await effectiveClientPermissions(ids.user, clientId)).not.toContain(`${namespace}.lead`);

    await prisma.groupMembership.update({
      where: { userId_groupId_year: { userId: ids.user, groupId: ids.group, year } },
      data: { role: 'LEAD' },
    });
    expect(await effectiveClientPermissions(ids.user, clientId)).toContain(`${namespace}.lead`);
  });

  it('drops a deprecated code without touching the rest', async () => {
    await prisma.ssoClientPermission.update({
      where: { id: permissionIds[`${namespace}.edit`] },
      data: { deprecated: true },
    });
    const codes = await effectiveClientPermissions(ids.user, clientId);
    expect(codes).not.toContain(`${namespace}.edit`);
    expect(codes).toContain(`${namespace}.read`);

    await prisma.ssoClientPermission.update({
      where: { id: permissionIds[`${namespace}.edit`] },
      data: { deprecated: false },
    });
  });

  it('keeps the code when a second path still grants it', async () => {
    // De regel waarop het gericht uitloggen steunt: één toekenning intrekken mag
    // niemand raken die de code ook via een ander pad houdt.
    const second = await prisma.role.create({
      data: { id: randomUUID(), code: `perm-role2-${suffix}`, nameNl: 'Tweede', nameEn: 'Second' },
    });
    await prisma.userRole.create({ data: { userId: ids.user, roleId: second.id, year } });
    await prisma.ssoRoleClientPermission.create({
      data: { permissionId: permissionIds[`${namespace}.edit`], clientId, roleId: second.id },
    });

    // De eerste rol verliezen laat de code staan, want de tweede geeft ze ook.
    await prisma.userRole.deleteMany({ where: { userId: ids.user, roleId: ids.role, year } });
    expect(await effectiveClientPermissions(ids.user, clientId)).toContain(`${namespace}.edit`);

    // Pas als het laatste pad wegvalt, is de code echt weg.
    await prisma.ssoRoleClientPermission.deleteMany({ where: { roleId: second.id } });
    expect(await effectiveClientPermissions(ids.user, clientId)).not.toContain(`${namespace}.edit`);

    await prisma.userRole.deleteMany({ where: { roleId: second.id } });
    await prisma.role.delete({ where: { id: second.id } });
    await prisma.userRole.create({ data: { userId: ids.user, roleId: ids.role, year } });
  });

  it('releases nothing for a deactivated member', async () => {
    await prisma.user.update({ where: { id: ids.user }, data: { active: false } });
    expect(await effectiveClientPermissions(ids.user, clientId)).toEqual([]);
    await prisma.user.update({ where: { id: ids.user }, data: { active: true } });
  });
});

describe('the access gate', () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = { granted: randomUUID(), denied: randomUUID() };
  const clientId = `gate-test-${suffix}`;
  const namespace = `gate${suffix.replace(/[^a-z0-9]/g, '')}`;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: ids.granted,
          name: 'Met toegang',
          email: `gate-${ids.granted}@student.kuleuven.be`,
          emailVerified: true,
          active: true,
        },
        {
          id: ids.denied,
          name: 'Zonder toegang',
          email: `gate-${ids.denied}@student.kuleuven.be`,
          emailVerified: true,
          active: true,
        },
      ],
    });

    await prisma.oauthClient.create({
      data: {
        id: clientId,
        clientId,
        name: 'Interne wiki',
        redirectUris: ['https://wiki.vtk.be/cb'],
        scopes: ['openid', 'entitlements'],
        accessMode: 'OPEN',
        permissionNamespace: namespace,
      },
    });

    const access = await prisma.ssoClientPermission.create({
      data: { clientId, code: `${namespace}.access`, labelNl: 'Toegang', labelEn: 'Access', system: true },
    });
    await prisma.ssoClientPermission.create({
      data: { clientId, code: `${namespace}.read`, labelNl: 'Lezen', labelEn: 'Read' },
    });
    await prisma.ssoUserClientPermission.create({
      data: { permissionId: access.id, clientId, userId: ids.granted },
    });
  });

  afterAll(async () => {
    await prisma.oauthClient.deleteMany({ where: { clientId } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.granted, ids.denied] } } });
  });

  it('lets everyone into an OPEN client', async () => {
    // De cudi-tool: iedereen mag binnen, permissies bepalen enkel wat je er méér mag.
    expect((await checkClientAccess(ids.denied, clientId)).allowed).toBe(true);
  });

  it('blocks a member without the access permission once restricted', async () => {
    await prisma.oauthClient.update({ where: { clientId }, data: { accessMode: 'RESTRICTED' } });

    expect((await checkClientAccess(ids.granted, clientId)).allowed).toBe(true);
    expect((await checkClientAccess(ids.denied, clientId)).allowed).toBe(false);
  });

  it('does not accept another permission in place of the access one', async () => {
    // `<ns>.read` hebben is niet hetzelfde als binnen mogen; dat onderscheid is
    // de hele reden dat de access-permissie apart bestaat.
    const read = await prisma.ssoClientPermission.findUniqueOrThrow({
      where: { clientId_code: { clientId, code: `${namespace}.read` } },
    });
    await prisma.ssoUserClientPermission.create({
      data: { permissionId: read.id, clientId, userId: ids.denied },
    });

    expect(await effectiveClientPermissions(ids.denied, clientId)).toEqual([`${namespace}.read`]);
    expect((await checkClientAccess(ids.denied, clientId)).allowed).toBe(false);
  });

  it('stays shut when a restricted client has no namespace configured', async () => {
    await prisma.oauthClient.update({ where: { clientId }, data: { permissionNamespace: null } });
    expect((await checkClientAccess(ids.granted, clientId)).allowed).toBe(false);
    await prisma.oauthClient.update({ where: { clientId }, data: { permissionNamespace: namespace } });
  });

  it('emits the codes as the permissions claim, but only with a client', async () => {
    const withClient = await resolveClaims({
      destination: 'userinfo',
      userId: ids.granted,
      scopes: ['entitlements'],
      clientId,
    });
    expect(withClient.permissions).toEqual([`${namespace}.access`]);

    // Zonder client is de vraag niet te beantwoorden; dan hoort de claim weg te
    // blijven in plaats van een lege lijst te suggereren dat het lid niets mag.
    const withoutClient = await resolveClaims({
      destination: 'userinfo',
      userId: ids.granted,
      scopes: ['entitlements'],
    });
    expect(withoutClient.permissions).toBeUndefined();
  });
});

describe('the KU Leuven requirement', () => {
  const suffix = randomUUID().slice(0, 8);
  const ids = {
    password: randomUUID(),
    unchecked: randomUUID(),
    staff: randomUUID(),
    student: randomUUID(),
  };
  const clientId = `kul-gate-test-${suffix}`;
  const namespace = `kul${suffix.replace(/[^a-z0-9]/g, '')}`;
  const checkedAt = new Date('2026-11-20T10:00:00.000Z');

  beforeAll(async () => {
    const user = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      name: `KUL ${id}`,
      email: `kul-${id}@example.com`,
      emailVerified: true,
      active: true,
      ...extra,
    });
    await prisma.user.createMany({
      data: [
        // Enkel een wachtwoord, geen KU Leuven-login.
        user(ids.password),
        // Gekoppeld van vóór de studentencontrole: nog niet gecontroleerd.
        user(ids.unchecked),
        user(ids.staff, { kulStudent: false, kulStudentChangedAt: checkedAt }),
        user(ids.student, { kulStudent: true, kulStudentChangedAt: checkedAt }),
      ],
    });
    await prisma.account.createMany({
      data: [ids.unchecked, ids.staff, ids.student].map((userId) => ({
        id: randomUUID(),
        accountId: `${userId}@kuleuven.be`,
        providerId: 'kuleuven',
        userId,
      })),
    });
    await prisma.oauthClient.create({
      data: {
        id: clientId,
        clientId,
        name: 'Burgieclan',
        redirectUris: ['https://burgieclan.vtk.be/cb'],
        scopes: ['openid'],
        accessMode: 'OPEN',
        permissionNamespace: namespace,
      },
    });
  });

  afterAll(async () => {
    await prisma.oauthClient.deleteMany({ where: { clientId } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
  });

  const reasons = async () =>
    Object.fromEntries(
      await Promise.all(
        Object.entries(ids).map(async ([key, id]) => {
          const access = await checkClientAccess(id, clientId);
          return [key, access.allowed ? 'allowed' : access.reason];
        })
      )
    );

  it('changes nothing for a client without a requirement', async () => {
    expect(await reasons()).toEqual({
      password: 'allowed',
      unchecked: 'allowed',
      staff: 'allowed',
      student: 'allowed',
    });
  });

  it('LINKED lets in every KU Leuven login, staff included', async () => {
    await prisma.oauthClient.update({ where: { clientId }, data: { kulRequirement: 'LINKED' } });
    expect(await reasons()).toEqual({
      password: 'kul',
      unchecked: 'allowed',
      staff: 'allowed',
      student: 'allowed',
    });
  });

  it('STUDENT asks an unchecked link to sign in again instead of calling it staff', async () => {
    await prisma.oauthClient.update({ where: { clientId }, data: { kulRequirement: 'STUDENT' } });
    expect(await reasons()).toEqual({
      password: 'kul',
      unchecked: 'kul',
      staff: 'student',
      student: 'allowed',
    });
  });

  it('STUDENT no longer holds once the KU Leuven login is unlinked', async () => {
    await prisma.account.deleteMany({ where: { userId: ids.student, providerId: 'kuleuven' } });
    expect((await checkClientAccess(ids.student, clientId)).reason).toBe('kul');
    await prisma.account.create({
      data: { id: randomUUID(), accountId: `${ids.student}@kuleuven.be`, providerId: 'kuleuven', userId: ids.student },
    });
  });

  it('reports the missing permission before the KU Leuven login', async () => {
    // Wie de access-permissie mist, helpt een KU Leuven-login niet verder.
    await prisma.oauthClient.update({ where: { clientId }, data: { accessMode: 'RESTRICTED' } });
    expect((await checkClientAccess(ids.password, clientId)).reason).toBe('permission');
    expect((await checkClientAccess(ids.student, clientId)).reason).toBe('permission');
    await prisma.oauthClient.update({ where: { clientId }, data: { accessMode: 'OPEN' } });
  });
});
