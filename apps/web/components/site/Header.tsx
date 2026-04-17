import Image from "next/image";
import Link from "next/link";
import { prisma } from "@vtk/db";
import { pick } from "@vtk/i18n";
import type { Locale } from "@/lib/locale";
import { getDictionary } from "@vtk/i18n";
import { getSession } from "@/lib/session";
import { ProfileMenu } from "./ProfileMenu";
import { LocaleSwitcher } from "./LocaleSwitcher";

function AnonymousUserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.25" />
      <path d="M6.5 19.25v-.5c0-2.35 2.02-4.25 5.5-4.25s5.5 1.9 5.5 4.25v.5" />
    </svg>
  );
}

export async function Header({ locale }: { locale: Locale }) {
  const [tabs, session] = await Promise.all([
    prisma.headerTab.findMany({
      where: { visible: true },
      orderBy: { order: "asc" },
    }),
    getSession(),
  ]);
  const dict = getDictionary(locale);
  const base = locale === "nl" ? "" : "/en";
  const loginLabel = dict.header.login;

  return (
    <header className="sticky top-0 z-40 border-b border-vtk-blue/10 bg-white/90 shadow-[0_4px_30px_-8px_rgba(26,31,74,0.12)] backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-3 sm:h-[4.25rem]">
          <Link
            href={`${base}/`}
            className="relative block h-9 w-[7.5rem] shrink-0 sm:h-10 sm:w-40"
            aria-label="VTK — home"
          >
            <Image
              src="/VTK.png"
              alt=""
              fill
              className="object-contain object-left"
              sizes="(max-width: 640px) 120px, 160px"
              priority
            />
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 px-3 lg:flex">
            {tabs.map((tab) => (
              <Link
                key={tab.id}
                href={`${base}/${tab.slug}`}
                className="rounded-full px-3 py-2 text-sm font-medium text-vtk-blue/85 transition-colors hover:bg-vtk-blue-soft hover:text-vtk-blue"
              >
                {pick(tab.labelNl, tab.labelEn, locale)}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <LocaleSwitcher locale={locale} />
            {session ? (
              <ProfileMenu
                name={session.user.name}
                isAdmin={
                  session.user.isSuperAdmin || session.permissions.length > 0
                }
                labels={{
                  myAccount: dict.header.myAccount,
                  admin: dict.header.admin,
                  logout: dict.header.logout,
                }}
                base={base}
              />
            ) : (
              <Link
                href={`${base}/inloggen`}
                aria-label={loginLabel}
                title={loginLabel}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-vtk-blue/20 text-vtk-blue/75 transition hover:border-vtk-blue/35 hover:bg-vtk-blue-soft hover:text-vtk-blue sm:h-10 sm:w-10"
              >
                <AnonymousUserIcon className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" />
              </Link>
            )}
          </div>
        </div>

        <nav className="-mx-4 overflow-x-auto border-t border-vtk-blue/5 pb-3 pt-2 lg:hidden">
          <ul className="flex min-w-max gap-1 px-4">
            {tabs.map((tab) => (
              <li key={tab.id} className="shrink-0">
                <Link
                  href={`${base}/${tab.slug}`}
                  className="inline-block rounded-full border border-transparent px-3 py-1.5 text-sm font-medium text-vtk-blue/90 hover:border-vtk-blue/15 hover:bg-vtk-blue-soft"
                >
                  {pick(tab.labelNl, tab.labelEn, locale)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
