import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { ToastProvider } from '@/components/ui/toast';
import { hasLocale } from '@/lib/locale';
import { getCurrentSession } from '@/lib/session';
import { currentWorkingYear } from '@/lib/workingYear';

import '@/app/design/vtk-base.css';
import '@/app/design/vtk-site-header.css';
import '@/app/design/vtk-site-chrome.css';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();

  // Twee gates voor een ingelogd lid, in deze volgorde. De resolved
  // (locale-prefixed) path komt van de proxy via `x-pathname`; we slaan de
  // redirect over op de doelpagina zelf om geen loop te maken.
  const session = await getCurrentSession();
  if (session) {
    const currentPath = (await headers()).get('x-pathname') ?? '';
    const segment = currentPath.split('/')[2];

    // 1. Onboarding: profiel nog niet ingevuld -> eerst dat afwerken.
    if (!session.user.onboarded) {
      if (segment !== 'onboarding') {
        redirect(locale === 'en' ? '/en/onboarding' : '/nl/onboarding');
      }
    } else if (session.user.studyConfirmedYear !== currentWorkingYear()) {
      // 2. Studiebevestiging: bij elk nieuw werkingsjaar declareert het lid
      //    opnieuw wat het studeert. Dat vervangt het jaarlijkse signaal dat
      //    vroeger via de cursusdienst binnenkwam en houdt de mailinglijsten
      //    beperkt tot wie effectief nog studeert.
      if (segment !== 'studie-bevestigen') {
        redirect(locale === 'en' ? '/en/studie-bevestigen' : '/nl/studie-bevestigen');
      }
    }
  }

  return (
    <ToastProvider>
      <Header locale={locale} />
      {/* `flex-1` + `min-h-0` pins main to viewport height and lets children overflow;
          that overflow painted over the footer looked like “footer in the hero”. */}
      <main className="grow" style={{ background: 'var(--paper)' }}>
        {children}
      </main>
      <Footer locale={locale} />
    </ToastProvider>
  );
}
