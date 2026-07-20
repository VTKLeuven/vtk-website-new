/**
 * @author Witse Panneels
 * @date 2026-07-20
 */
import { hasPermission } from './session';

export async function hasSSOPrivileges(headers: Headers): Promise<boolean> {
  return hasPermission(headers, 'oauth.client.edit');
}
