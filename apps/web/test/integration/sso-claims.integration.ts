import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@vtk/db';
import { resolveClaims } from '@vtk/auth/server';
import { currentWorkingYear } from '@vtk/auth';

/**
 * De resolver tegen een echte database: hier zit het risico dat de unit tests
 * niet dekken (veldnamen, enum-vormen, de rollen-join).
 */
describe.sequential('claim resolution', () => {
  const ids = { user: randomUUID(), group: randomUUID(), role: randomUUID() };
  const email = `claims-${ids.user}@student.kuleuven.be`;

  beforeAll(async () => {
    const permission = await prisma.permission.findFirst({ select: { id: true, code: true } });

    await prisma.user.create({
      data: {
        id: ids.user,
        name: 'Jan Janssens',
        firstName: 'Jan',
        lastName: 'Janssens',
        email,
        rNumber: `r${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
        emailVerified: true,
        locale: 'NL',
        active: true,
        onboardedAt: new Date(),
        birthDate: new Date('2003-05-17T00:00:00Z'),
        personalEmail: 'jan@example.be',
        emailPreference: 'UNIVERSITY',
        street: 'Naamsestraat',
        houseNumber: '22',
        postalCode: '3000',
        city: 'Leuven',
        studyProgrammes: ['COMPUTER_SCIENCE'],
        studyYears: ['MASTER_1'],
        notAtFaculty: false,
        studyConfirmedYear: currentWorkingYear(),
      },
    });

    await prisma.group.create({
      data: { id: ids.group, code: 'claims-test-groep', slug: `claims-${ids.group}`, nameNl: 'Test', nameEn: 'Test' },
    });
    await prisma.groupMembership.create({
      data: { userId: ids.user, groupId: ids.group, year: currentWorkingYear(), role: 'MEMBER' },
    });

    // Een rol met een permissie, via directe toewijzing.
    await prisma.role.create({
      data: {
        id: ids.role,
        code: `claims-test-${ids.role}`,
        nameNl: 'Testrol',
        nameEn: 'Test role',
      },
    });
    if (permission) {
      await prisma.rolePermission.create({ data: { roleId: ids.role, permissionId: permission.id } });
    }
    await prisma.userRole.create({
      data: { userId: ids.user, roleId: ids.role, year: currentWorkingYear() },
    });
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { userId: ids.user } });
    await prisma.rolePermission.deleteMany({ where: { roleId: ids.role } });
    await prisma.groupMembership.deleteMany({ where: { userId: ids.user } });
    await prisma.role.deleteMany({ where: { id: ids.role } });
    await prisma.group.deleteMany({ where: { id: ids.group } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
  });

  it('releases nothing without scopes', async () => {
    const claims = await resolveClaims({ destination: 'userinfo', userId: ids.user, scopes: [] });
    expect(claims).toEqual({});
  });

  it('releases nothing for openid alone', async () => {
    const claims = await resolveClaims({
      destination: 'userinfo',
      userId: ids.user,
      scopes: ['openid'],
    });
    expect(claims).toEqual({});
  });

  it('resolves profile and email claims', async () => {
    const claims = await resolveClaims({
      destination: 'userinfo',
      userId: ids.user,
      scopes: ['profile', 'email'],
    });
    expect(claims.name).toBe('Jan Janssens');
    expect(claims.given_name).toBe('Jan');
    expect(claims.family_name).toBe('Janssens');
    expect(claims.locale).toBe('nl-BE');
    expect(claims.email).toBe(email);
    expect(claims.email_verified).toBe(true);
    expect(claims['vtk:onboarded']).toBe(true);
  });

  it('keeps `email` on the university address whatever the member prefers', async () => {
    // `email` is de identiteitsclaim: laat je die meebewegen met de voorkeur,
    // dan matcht een client het lid na één profielwijziging niet meer.
    await prisma.user.update({ where: { id: ids.user }, data: { emailPreference: 'PERSONAL' } });
    const claims = await resolveClaims({
      destination: 'userinfo',
      userId: ids.user,
      scopes: ['email'],
    });
    expect(claims.email).toBe(email);
    expect(claims['vtk:preferred_email']).toBe('jan@example.be');
    await prisma.user.update({ where: { id: ids.user }, data: { emailPreference: 'UNIVERSITY' } });
  });

  it('points the preferred address at the university one when that is the preference', async () => {
    const claims = await resolveClaims({
      destination: 'userinfo',
      userId: ids.user,
      scopes: ['email'],
    });
    expect(claims['vtk:preferred_email']).toBe(email);
  });

  it('keeps the student number out of the programme scope', async () => {
    const programme = await resolveClaims({
      destination: 'userinfo',
      userId: ids.user,
      scopes: ['vtk:study_programme'],
    });
    expect(programme['vtk:study_programmes']).toEqual(['computer_science']);
    expect(programme['vtk:student_number']).toBeUndefined();
    expect(programme['vtk:study_years']).toBeUndefined();

    const number = await resolveClaims({
      destination: 'userinfo',
      userId: ids.user,
      scopes: ['vtk:student_number'],
    });
    expect(typeof number['vtk:student_number']).toBe('string');
    expect(number['vtk:study_programmes']).toBeUndefined();
  });

  it('releases no VTK org structure, even though the fixture has a role and a post', async () => {
    // Het lid zit in een post en heeft een rol met een permissie; precies de
    // gegevens die vroeger onder `entitlements` en `vtk:membership` vrijkwamen.
    // Fase 5 vult `entitlements` met de permissies van de client zelf; tot dan
    // hoort er niets uit te komen.
    const claims = await resolveClaims({
      destination: 'userinfo',
      userId: ids.user,
      scopes: ['entitlements', 'vtk:membership'],
    });
    expect(claims).toEqual({});
  });

  it('builds an OIDC address object', async () => {
    const claims = await resolveClaims({
      destination: 'userinfo',
      userId: ids.user,
      scopes: ['address'],
    });
    const address = claims.address as Record<string, unknown>;
    expect(address.locality).toBe('Leuven');
    expect(address.postal_code).toBe('3000');
    expect(address.country).toBe('BE');
  });

  it('formats the birth date as a plain date', async () => {
    const claims = await resolveClaims({
      destination: 'userinfo',
      userId: ids.user,
      scopes: ['vtk:contact'],
    });
    expect(claims.birthdate).toBe('2003-05-17');
  });

  it('keeps sensitive claims out of the ID token', async () => {
    const idToken = await resolveClaims({
      destination: 'id_token',
      userId: ids.user,
      scopes: ['profile', 'email', 'vtk:contact', 'vtk:student_number', 'address'],
    });
    expect(idToken.name).toBe('Jan Janssens');
    expect(idToken.birthdate).toBeUndefined();
    expect(idToken['vtk:student_number']).toBeUndefined();
    expect(idToken.address).toBeUndefined();
  });

  it('releases nothing for a deactivated member', async () => {
    await prisma.user.update({ where: { id: ids.user }, data: { active: false } });
    const claims = await resolveClaims({
      destination: 'userinfo',
      userId: ids.user,
      scopes: ['profile', 'email'],
    });
    expect(claims).toEqual({});
    await prisma.user.update({ where: { id: ids.user }, data: { active: true } });
  });

  it('returns an empty set for an unknown user rather than throwing', async () => {
    const claims = await resolveClaims({
      destination: 'userinfo',
      userId: 'does-not-exist',
      scopes: ['profile'],
    });
    expect(claims).toEqual({});
  });
});
