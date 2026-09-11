import { LoginGate } from '@/components/login-gate';
import { ToastProvider } from '@/components/ui/toast';
import { canManage, getSession } from '@/lib/session';
import { BeheerNav } from './beheer-nav';
import { copy, getLocale } from '@/lib/i18n';

import { BeheerLayoutClient } from './beheer-layout-client';

export default async function BeheerLayout({ children }: { children: React.ReactNode }) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = copy[locale];
  if (!session) {
    return <LoginGate variant="manage" />;
  }
  if (!canManage(session)) {
    return (
      <main className="mx-auto grid w-full max-w-5xl flex-1 place-items-center px-5 py-12">
        <section className="w-full max-w-xl rounded-[22px] border border-vtk-navy/10 bg-vtk-surface p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-vtk-ink">{t.noAccess}</h1>
          <p className="mt-3 leading-7 text-vtk-body">
            Het beheer van de uitleendienst is voorbehouden voor het team van Logistiek. Denk je dat dit een vergissing
            is, mail dan logistiek@vtk.be.
          </p>
        </section>
      </main>
    );
  }

  return (
    <ToastProvider>
      <BeheerLayoutClient
        kicker={t.manageKicker}
        title={t.manageTitle}
        nav={<BeheerNav />}
      >
        {children}
      </BeheerLayoutClient>
    </ToastProvider>
  );
}
