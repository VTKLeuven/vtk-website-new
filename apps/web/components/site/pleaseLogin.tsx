import Link from 'next/link';
import { getDictionary, type Locale } from '@vtk/i18n';

type PleaseLoginProps = {
  locale: Locale;
  nextPath?: string;
  className?: string;
};

export function PleaseLogin({ locale, nextPath, className }: PleaseLoginProps) {
  const nl = locale === 'nl';
  const dict = getDictionary(locale);
  const base = nl ? '' : '/en';
  const loginHref = nextPath
    ? `${base}/inloggen?next=${encodeURIComponent(nextPath)}`
    : `${base}/inloggen`;

  return (
    <section className={className}>
      <div className="vtk-card mx-auto max-w-2xl text-center">
        <div className="vtk-page-kicker">{dict.auth.loginRequiredKicker}</div>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-vtk-ink">
          {dict.auth.loginRequiredTitle}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#34405e]">
          {dict.auth.loginRequiredBody}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href={loginHref} className="vtk-button vtk-button-primary">
            {dict.auth.signIn}
          </Link>
          <Link href={`${base}/`} className="vtk-button vtk-button-ghost">
            {dict.auth.goHome}
          </Link>
        </div>
      </div>
    </section>
  );
}

export default PleaseLogin;
