import { LoginGate } from '@/components/login-gate';
import { ToastProvider } from '@/components/ui/toast';
import { canManage, getSession } from '@/lib/session';
import { BeheerNav } from './beheer-nav';
import { copy, getLocale } from '@/lib/i18n';

export default async function BeheerLayout({ children }: { children: React.ReactNode }) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = copy[locale];
  if (!session) {
    return <LoginGate message="Log in om het beheer van de uitleendienst te openen." />;
  }
  if (!canManage(session)) {
    return (
      <main className="mx-auto grid w-full max-w-5xl flex-1 place-items-center px-5 py-12">
        <section className="w-full max-w-xl rounded-[22px] border border-vtk-navy/10 bg-vtk-surface p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-vtk-ink">{t.noAccess}</h1>
          <p className="mt-3 leading-7 text-vtk-body">
            Het beheer van de uitleendienst is voorbehouden voor het team van Logistiek. Denk je
            dat dit een vergissing is, mail dan logistiek@vtk.be.
          </p>
        </section>
      </main>
    );
  }

  return (
    <ToastProvider>
      <main className="mx-auto w-full max-w-[1320px] flex-1 px-5 py-10 sm:px-9">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-vtk-navy/10 pb-5">
          <div>
            <p className="flex items-center gap-2 text-sm text-vtk-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-vtk-yellow" aria-hidden />
              {t.manageKicker}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-vtk-ink">
              {t.manageTitle}
            </h1>
          </div>
          <BeheerNav />
        </div>
        <div className="mt-8">{children}</div>
      </main>
    </ToastProvider>
  );
}
