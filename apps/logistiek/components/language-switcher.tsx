'use client';

import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE, type LogistiekLocale } from '@/lib/i18n-shared';

export function LanguageSwitcher({ locale }: { locale: LogistiekLocale }) {
  const router = useRouter();

  function change(next: LogistiekLocale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <div className="lang-toggle" role="group" aria-label="Taal / Language">
      <button type="button" onClick={() => change('nl')} aria-pressed={locale === 'nl'}>
        NL
      </button>
      <span className="lang-sep" aria-hidden>/</span>
      <button type="button" onClick={() => change('en')} aria-pressed={locale === 'en'}>
        EN
      </button>
    </div>
  );
}
