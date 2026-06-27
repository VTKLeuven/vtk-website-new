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
import { prisma } from '@vtk/db';
import type { SessionPayload } from './index';
import { auth } from './auth';

export { auth } from './auth'; // kind of would like not to have to do this...
export { hashPassword } from './logins/password';
export { ApiHandler } from './apiHandlers/apiHandler';
export { getSession } from './server/session';
export { createUser, updateUser, setUserPassword, deleteUser } from './server/users';
