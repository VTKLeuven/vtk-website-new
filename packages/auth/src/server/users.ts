/**
 * @author Witse Panneels
 * @date 2026-06-25
 */
import 'server-only';

import type { Prisma, User } from '@prisma/client';
import { prisma } from '@vtk/db';
import type { Locale, SessionPayload } from '..';
import { hasPermission, AuthError } from '..';
import { hashPassword } from '../logins/password';
import { auth, Auth } from '../auth';

type CreateUserInput = {
  email: string;
  name: string;
  password: string;
  locale: Locale;
  avatarKey?: string | null;
  active?: boolean;
  isSuperAdmin?: boolean;
};
type UpdateUserInput = {
  email?: string;
  name?: string;
  locale?: Locale;
  avatarKey?: string | null;
  active?: boolean;
  isSuperAdmin?: boolean;
};

function assertCan(actor: SessionPayload, permission: string): void {
  if (!hasPermission(actor, permission)) {
    throw new AuthError('FORBIDDEN');
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createUser(actor: SessionPayload, input: CreateUserInput): Promise<User> {
  assertCan(actor, 'users.create');

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizeEmail(input.email),
        name: input.name.trim(),
        locale: input.locale,
        avatarKey: input.avatarKey ?? null,
        active: input.active ?? true,
        isSuperAdmin: input.isSuperAdmin ?? false,
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
  const data: Prisma.UserUpdateInput = {
    ...(input.email ? { email: normalizeEmail(input.email) } : {}),
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.locale !== undefined ? { locale: input.locale } : {}),
    ...(input.avatarKey !== undefined ? { avatarKey: input.avatarKey } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
    ...(input.isSuperAdmin !== undefined ? { isSuperAdmin: input.isSuperAdmin } : {}),
  };
  return prisma.user.update({
    where: { id: userId },
    data,
  });
}

export async function setUserPassword(
  actor: SessionPayload,
  userId: string,
  password: string
): Promise<void> {
  assertCan(actor, 'users.edit');
  const passwordHash = await hashPassword(password);
  await prisma.account.upsert({
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
export async function deleteUser(actor: SessionPayload, userId: string): Promise<void> {
  assertCan(actor, 'users.delete');
  await prisma.$transaction(async (tx) => {
    await tx.account.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });
}
