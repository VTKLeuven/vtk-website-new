/**
 * @author Witse Panneels
 * @date 2026-07-20
 */
import { Auth } from '../auth';
import { hasPermission } from './session';
import { AuthError } from '..';

export async function hasSSOPrivileges(headers: Headers): Promise<boolean | undefined> {
  return hasPermission(headers, 'oauth.client.edit');
}

/**
 * Register an SSO client using a server **ADMIN ONLY** action
 *
 * requires permission "sso.client.edit" to be successful
 */
export async function registerSSOClient(headers: Headers) {
  // if (!(await hasPermission(headers, 'sso.client.edit'))) throw new AuthError('FORBIDDEN');
  //use adminCreateOAuthClient so we can also set restricted fields
}
