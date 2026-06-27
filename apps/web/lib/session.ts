import { headers } from 'next/headers';
import {
  getSession as getSessionFromHeaders,
  requireSession as requireSessionFromHeaders,
  requirePermission as requirePermissionFromHeaders,
} from '@vtk/auth/server';

export async function getSession() {
  return getSessionFromHeaders(await headers());
}
export async function requireSession() {
  return requireSessionFromHeaders(await headers());
}
export async function requirePermission(permission: string) {
  return requirePermissionFromHeaders(await headers(), permission);
}
