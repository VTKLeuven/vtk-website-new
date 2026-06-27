/**
 * @author Witse Panneels
 * @date 2026-06-19
 *
 * better-auth server components, to be used on central platform / app (@vtk/web)
 * Also includes functions for sso and session validation for remote apps (@vtk/logistiek, ...)
 *
 * If you are working on a remote app, please do not use this file/these components, use ./remote.ts instead!
 *
 * !do not import these into a client component!
 */
import 'server-only';
import { auth } from './auth';

export { hashPassword } from './logins/password';
export { isKulEnabled } from './logins/kul';
export { ApiHandler } from './apiHandlers/apiHandler';
export { getSession } from './server/session';
export { createUser, updateUser, setUserPassword, deleteUser } from './server/users';

export async function signInEmail(
  headers: Headers,
  body: {
    email: string;
    password: string;
  }
) {
  return auth.api.signInEmail({
    headers,
    body,
  });
}

export async function signOut(headers: Headers) {
  return auth.api.signOut({
    headers,
  });
}
