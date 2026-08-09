/**
 * @author Witse Panneels
 * @date 2026-06-25
 */
import 'server-only';

import type { Prisma, User } from '@prisma/client';
import { prisma } from '@vtk/db';
import type { Locale, Permission, SessionPayload } from '..';
import { hasPermission, AuthError } from '..';
import { hashPassword } from '../logins/password';

type CreateUserInput = {
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  password: string;
  locale: Locale;
  avatarKey?: string | null;
  active?: boolean;
  isSuperAdmin?: boolean;
  rNumber?: string | null;
};
type UpdateUserInput = {
  email?: string;
  name?: string;
  firstName?: string | null;
  lastName?: string | null;
  locale?: Locale;
  avatarKey?: string | null;
  active?: boolean;
  isSuperAdmin?: boolean;
  rNumber?: string | null;
  password?: string;
};

function assertCan(actor: SessionPayload, permission: Permission): void {
  if (!hasPermission(actor, permission)) {
    throw new AuthError('FORBIDDEN');
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertStrongEnoughPassword(password: string): void {
  if (password.length < 8) throw new AuthError('PASSWORD_TOO_SHORT');
}

function assertCanManageSuperAdmin(actor: SessionPayload, targetIsSuperAdmin: boolean): void {
  if (targetIsSuperAdmin && !actor.user.isSuperAdmin) throw new AuthError('FORBIDDEN');
}

export async function createUser(actor: SessionPayload, input: CreateUserInput): Promise<User> {
  assertCan(actor, 'users.edit');
  assertCanManageSuperAdmin(actor, input.isSuperAdmin === true);
  assertStrongEnoughPassword(input.password);

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizeEmail(input.email),
        name: input.name.trim(),
        firstName: input.firstName?.trim() || null,
        lastName: input.lastName?.trim() || null,
        locale: input.locale,
        avatarKey: input.avatarKey ?? null,
        active: input.active ?? true,
        isSuperAdmin: input.isSuperAdmin ?? false,
        rNumber: input.rNumber?.trim() || null,
      },
    });

    await tx.account.create({
      data: {
        id: `credential:${user.id}`,
        accountId: user.id,
        providerId: 'credential',
        userId: user.id,
        password: passwordHash,
      },
    });

    return user;
  });
}

export async function updateUser(
  actor: SessionPayload,
  userId: string,
  input: UpdateUserInput
): Promise<User> {
  assertCan(actor, 'users.edit');
  if (input.password) assertStrongEnoughPassword(input.password);
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  const data: Prisma.UserUpdateInput = {
    ...(input.email ? { email: normalizeEmail(input.email) } : {}),
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.firstName !== undefined ? { firstName: input.firstName?.trim() || null } : {}),
    ...(input.lastName !== undefined ? { lastName: input.lastName?.trim() || null } : {}),
    ...(input.locale !== undefined ? { locale: input.locale } : {}),
    ...(input.avatarKey !== undefined ? { avatarKey: input.avatarKey } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
    ...(input.isSuperAdmin !== undefined ? { isSuperAdmin: input.isSuperAdmin } : {}),
    ...(input.rNumber !== undefined ? { rNumber: input.rNumber?.trim() || null } : {}),
  };
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
    if (!existing) throw new AuthError('NOT_FOUND');
    assertCanManageSuperAdmin(actor, existing.isSuperAdmin || input.isSuperAdmin === true);
    const user = await tx.user.update({ where: { id: userId }, data });
    if (passwordHash) {
      await tx.account.upsert({
        where: { id: `credential:${userId}` },
        update: { password: passwordHash },
        create: {
          id: `credential:${userId}`,
          accountId: userId,
          providerId: 'credential',
          userId,
          password: passwordHash,
        },
      });
    }
    return user;
  });
}

export async function setUserPassword(
  actor: SessionPayload,
  userId: string,
  password: string
): Promise<void> {
  assertCan(actor, 'users.edit');
  assertStrongEnoughPassword(password);
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
    if (!target) throw new AuthError('NOT_FOUND');
    assertCanManageSuperAdmin(actor, target.isSuperAdmin);
    await tx.account.upsert({
      where: { id: `credential:${userId}` },
      update: { password: passwordHash },
      create: {
        id: `credential:${userId}`,
        accountId: userId,
        providerId: 'credential',
        userId,
        password: passwordHash,
      },
    });
  });
}
export async function deleteUser(actor: SessionPayload, userId: string): Promise<void> {
  assertCan(actor, 'users.edit');
  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
    if (!target) return;
    assertCanManageSuperAdmin(actor, target.isSuperAdmin);
    await tx.account.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });
}
