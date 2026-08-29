import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession, canManageFakbar } from '@/lib/session';
import { ToastProvider } from '@/components/ui/toast';
import { FakbarAdminNav } from './admin-nav';

export const metadata: Metadata = {
  title: { default: 'Beheer', template: "%s · Beheer 't ElixIr" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) {
    const loginUrl =
      process.env.FAKBAR_TEST_LOGIN === 'true'
        ? '/test-login'
        : `${process.env.VTK_MAIN_URL ?? 'https://vtk.be'}/inloggen`;
    redirect(loginUrl);
  }

  if (!canManageFakbar(session)) {
    return (
      <main className="mx-auto grid w-full max-w-5xl flex-1 place-items-center px-5 py-12">
        <section className="fakbar-card w-full max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Geen toegang</h1>
          <p className="mt-3 leading-7 text-[var(--body)]">
            Het beheer van &rsquo;t ElixIr is voorbehouden voor de post Fakbar. Denk je dat dit een vergissing is,
            mail dan fakbar@vtk.be.
          </p>
        </section>
      </main>
    );
  }

  return (
    <ToastProvider>
      <div className="fakbar-page-head" data-print="hide">
        <div className="fakbar-page-head-inner !pb-8 !pt-11">
          <p className="fakbar-eyebrow">Beheer &rsquo;t ElixIr</p>
          <h1 className="!text-[clamp(28px,3.4vw,40px)]">{session.user.name}</h1>
        </div>
      </div>

      <div className="fakbar-page-content">
        <div className="fakbar-admin-layout">
          <aside data-print="hide">
            <FakbarAdminNav />
          </aside>
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
