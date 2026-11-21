import { cookies } from 'next/headers';
import { LOCALE_COOKIE, type LogistiekLocale } from './i18n-shared';

export { LOCALE_COOKIE, type LogistiekLocale } from './i18n-shared';
// Het woordenboek staat in `lib/copy.ts`, zodat ook clientcode het kan lezen.
export { copy, type LogistiekCopy } from './copy';

export async function getLocale(): Promise<LogistiekLocale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return value === 'en' ? 'en' : 'nl';
}
