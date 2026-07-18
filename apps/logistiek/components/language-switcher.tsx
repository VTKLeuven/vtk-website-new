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
    <div className="flex items-center gap-2 text-sm" aria-label="Language">
      <button type="button" onClick={() => change('nl')} className={locale === 'nl' ? 'cursor-pointer font-semibold text-white' : 'cursor-pointer text-white/55 transition hover:text-white'} aria-pressed={locale === 'nl'}>
        NL
      </button>
      <span className="text-white/35" aria-hidden>/</span>
      <button type="button" onClick={() => change('en')} className={locale === 'en' ? 'cursor-pointer font-semibold text-white' : 'cursor-pointer text-white/55 transition hover:text-white'} aria-pressed={locale === 'en'}>
        EN
      </button>
    </div>
  );
}
