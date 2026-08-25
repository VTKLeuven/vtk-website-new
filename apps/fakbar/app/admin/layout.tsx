import { redirect } from 'next/navigation';
import { getSession, canManageFakbar } from '@/lib/session';
import { AdminNav } from './admin-nav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) {
    const loginUrl = process.env.FAKBAR_TEST_LOGIN === 'true'
      ? '/test-login'
      : `${process.env.VTK_MAIN_URL ?? 'https://vtk.be'}/inloggen`;
    redirect(loginUrl);
  }

  if (!canManageFakbar(session)) {
    return (
      <main className="mx-auto grid w-full max-w-5xl flex-1 place-items-center px-5 py-12">
        <section className="w-full max-w-xl rounded-[22px] border border-[--line] bg-[--surface] p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[--ink]">Geen toegang</h1>
          <p className="mt-3 leading-7 text-[--muted]">
            Het beheer van 't ElixIr is voorbehouden voor de post Fakbar. Denk je dat dit een vergissing is, neem dan contact op met het praesidium.
          </p>
        </section>
      </main>
    );
  }

  return (
    <>
      {/* Admin page head */}
      <div className="fakbar-page-head" data-print="hide">
        <div className="fakbar-page-head-inner">
          <p className="fakbar-eyebrow">
            <span>'t ElixIr</span>
            <span aria-hidden>·</span>
            <span>{session.user.name}</span>
          </p>
          <h1>Beheer</h1>
        </div>
      </div>

      {/* Sidebar + content */}
      <div className="fakbar-page-content">
        <div className="fakbar-admin-layout">
          <AdminNav />
          <main>{children}</main>
        </div>
      </div>
    </>
  );
}
